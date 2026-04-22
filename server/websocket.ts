import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import { storage } from './storage';
import { WS_EVENTS, type WsMessage } from '@shared/schema';
import { db } from './db';
import { sql } from 'drizzle-orm';

// Maps deviceId to WebSocket connection
const connectedDevices = new Map<string, WebSocket>();
const socketPrimaryDeviceIds = new Map<WebSocket, string>();
const readyMobileDevices = new Set<string>();
const pendingClipboardByDevice = new Map<string, string[]>();
const devicePlatforms = new Map<string, string>();
const lastPongAtBySocket = new WeakMap<WebSocket, number>();
const PING_INTERVAL_MS = 30_000;
const SOCKET_STALE_TIMEOUT_MS = 120_000;

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const markSocketAlive = (socket: WebSocket) => {
    lastPongAtBySocket.set(socket, Date.now());
  };

  const getStringField = (obj: any, ...keys: string[]): string | null => {
    for (const key of keys) {
      if (obj && typeof obj[key] === 'string' && obj[key].trim().length > 0) {
        return obj[key];
      }
    }
    return null;
  };

  // Keep-alive: ping all connected clients and terminate stale sockets.
  const keepAliveTimer = setInterval(() => {
    const now = Date.now();
    const uniqueSockets = new Set<WebSocket>();

    connectedDevices.forEach((ws) => {
      uniqueSockets.add(ws);
    });

    uniqueSockets.forEach((ws) => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const deviceId = socketPrimaryDeviceIds.get(ws) ?? 'unknown-device';
      const lastPongAt = lastPongAtBySocket.get(ws) ?? now;
      if (now - lastPongAt > SOCKET_STALE_TIMEOUT_MS) {
        console.warn(`[SERVER] terminating stale websocket for ${deviceId} (${now - lastPongAt}ms without pong)`);
        try {
          ws.terminate();
        } catch {
          // ignore
        }
        return;
      }

      try {
        ws.ping();
      } catch (err) {
        console.error(`[SERVER] ping failed for ${deviceId}`, err);
        try {
          ws.terminate();
        } catch {
          // ignore
        }
      }
    });
  }, PING_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(keepAliveTimer);
  });

  wss.on('connection', (ws) => {
    markSocketAlive(ws);

    let primaryDeviceId: string | null = null;
    const boundDeviceIds = new Set<string>();
    let currentConnectionSessionId: number | null = null;

    // Handle pong responses from client
    ws.on('pong', () => {
      markSocketAlive(ws);
    });

    const recordConnectionStarted = async (deviceId: string) => {
      try {
        await db.execute(sql`
          UPDATE connection_sessions
          SET disconnected_at = NOW(), close_reason = 'reconnected'
          WHERE device_id = ${deviceId} AND disconnected_at IS NULL
        `);

        const inserted = await db.execute(sql`
          INSERT INTO connection_sessions (device_id)
          VALUES (${deviceId})
          RETURNING id
        `);

        const row = inserted.rows?.[0] as { id?: number } | undefined;
        currentConnectionSessionId = typeof row?.id === 'number' ? row.id : null;
      } catch (err) {
        console.error('Failed to record connection session start:', err);
      }
    };

    const recordConnectionEnded = async (reason: string) => {
      try {
        if (typeof currentConnectionSessionId === 'number') {
          await db.execute(sql`
            UPDATE connection_sessions
            SET disconnected_at = NOW(), close_reason = ${reason}
            WHERE id = ${currentConnectionSessionId} AND disconnected_at IS NULL
          `);
        } else if (primaryDeviceId) {
          await db.execute(sql`
            UPDATE connection_sessions
            SET disconnected_at = NOW(), close_reason = ${reason}
            WHERE device_id = ${primaryDeviceId} AND disconnected_at IS NULL
          `);
        }
      } catch (err) {
        console.error('Failed to record connection session end:', err);
      }
    };

    const broadcastDeviceStatus = (deviceId: string, status: 'online' | 'offline') => {
      const statusMessage = JSON.stringify({
        type: WS_EVENTS.DEVICE_STATUS,
        payload: { deviceId, status }
      });

      connectedDevices.forEach((peerSocket, peerDeviceId) => {
        if (peerDeviceId === deviceId) {
          return;
        }

        if (peerSocket.readyState === WebSocket.OPEN) {
          peerSocket.send(statusMessage);
        }
      });
    };

    const bindDeviceId = (deviceId: string) => {
      const existingSocket = connectedDevices.get(deviceId);
      if (existingSocket && existingSocket !== ws) {
        console.warn(`[SERVER] replacing existing websocket binding for ${deviceId}`);
        try {
          existingSocket.close(4001, 'replaced-by-new-connection');
        } catch {
          // ignore
        }
      }

      connectedDevices.set(deviceId, ws);
      boundDeviceIds.add(deviceId);
    };

    const unbindDeviceIdIfOwnedByCurrentSocket = (deviceId: string): boolean => {
      const current = connectedDevices.get(deviceId);
      if (current !== ws) {
        return false;
      }

      connectedDevices.delete(deviceId);
      return true;
    };

    const isClipboardForward = (payload: any): boolean => {
      const command = getStringField(payload, 'command', 'Command');
      return !!command && (command.toLowerCase() === 'clipboard.sync' || command.toLowerCase() === 'clipboard');
    };

    const isClipboardSyncState = (payload: any): boolean => {
      const command = getStringField(payload, 'command', 'Command');
      return !!command && command.toLowerCase() === 'clipboard.sync.state';
    };

    const getClipboardSyncStateEnabled = (payload: any): boolean | null => {
      const innerPayload = payload?.payload ?? payload?.Payload;
      const value = innerPayload?.enabled ?? innerPayload?.Enabled;

      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') {
          return true;
        }

        if (normalized === 'false' || normalized === '0') {
          return false;
        }
      }

      return null;
    };

    const enqueuePendingClipboard = (targetDeviceId: string, messageText: string) => {
      const queue = pendingClipboardByDevice.get(targetDeviceId) ?? [];
      queue.push(messageText);
      if (queue.length > 10) {
        queue.shift();
      }
      pendingClipboardByDevice.set(targetDeviceId, queue);
    };

    const flushPendingClipboard = (targetDeviceId: string) => {
      const queue = pendingClipboardByDevice.get(targetDeviceId);
      if (!queue || queue.length === 0) {
        return;
      }

      const targetWs = connectedDevices.get(targetDeviceId);
      if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
        return;
      }

      while (queue.length > 0) {
        const next = queue.shift();
        if (next) {
          console.log(`[SERVER] broadcasting clipboard to 1 devices`);
          targetWs.send(next);
        }
      }
      pendingClipboardByDevice.delete(targetDeviceId);
    };

    const broadcastDeviceReady = (deviceId: string, ready: boolean) => {
      const readyMessage = JSON.stringify({
        type: 'device-ready',
        payload: { deviceId, ready }
      });

      connectedDevices.forEach((peerSocket, peerDeviceId) => {
        if (peerDeviceId === deviceId) {
          return;
        }

        if (peerSocket.readyState === WebSocket.OPEN) {
          peerSocket.send(readyMessage);
        }
      });
    };

    const sendOnlineSnapshotToCurrentSocket = (registeredDeviceId: string) => {
      socketPrimaryDeviceIds.forEach((peerDeviceId, peerSocket) => {
        if (peerDeviceId === registeredDeviceId || peerSocket === ws) {
          return;
        }

        if (peerSocket.readyState !== WebSocket.OPEN) {
          return;
        }

        ws.send(JSON.stringify({
          type: WS_EVENTS.DEVICE_STATUS,
          payload: { deviceId: peerDeviceId, status: 'online' }
        }));
      });
    };

    ws.on('message', async (data) => {
      markSocketAlive(ws);

      try {
        const message = JSON.parse(data.toString()) as any;
        const targetDeviceId = getStringField(message, 'targetDeviceId', 'TargetDeviceId');

        if (targetDeviceId) {
          const payload = message?.payload ?? message?.Payload;
          const sourceDeviceId = getStringField(message, 'sourceDeviceId', 'SourceDeviceId') ?? primaryDeviceId;
          const outgoingType = getStringField(message, 'type', 'Type') ?? 'command';

          if (sourceDeviceId && isClipboardSyncState(payload)) {
            const sourcePlatform = (devicePlatforms.get(sourceDeviceId) ?? '').toLowerCase();
            const sourceIsMobile = sourcePlatform === 'android' || sourceDeviceId.toLowerCase().startsWith('android-');
            if (sourceIsMobile) {
              const enabled = getClipboardSyncStateEnabled(payload);
              if (enabled === true) {
                readyMobileDevices.add(sourceDeviceId);
                broadcastDeviceReady(sourceDeviceId, true);
                flushPendingClipboard(sourceDeviceId);
              } else if (enabled === false) {
                readyMobileDevices.delete(sourceDeviceId);
                broadcastDeviceReady(sourceDeviceId, false);
              }
            }
          }

          const targetWs = connectedDevices.get(targetDeviceId);
          const isClipboardMessage = isClipboardForward(payload);
          const targetPlatform = (devicePlatforms.get(targetDeviceId) ?? '').toLowerCase();
          const targetRequiresReady = targetPlatform === 'android' || targetDeviceId.toLowerCase().startsWith('android-');

          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            const forwarded = {
              ...message,
              type: outgoingType,
              targetDeviceId,
              sourceDeviceId,
              payload,
            };
            const forwardedText = JSON.stringify(forwarded);

            if (isClipboardMessage && targetRequiresReady && !readyMobileDevices.has(targetDeviceId)) {
              enqueuePendingClipboard(targetDeviceId, forwardedText);
            } else {
              if (isClipboardMessage) {
                console.log(`[SERVER] broadcasting clipboard to 1 devices`);
              }
              targetWs.send(forwardedText);
            }
          } else {
            if (isClipboardMessage && targetRequiresReady) {
              const forwarded = {
                ...message,
                type: outgoingType,
                targetDeviceId,
                sourceDeviceId,
                payload,
              };
              enqueuePendingClipboard(targetDeviceId, JSON.stringify(forwarded));
            } else {
              ws.send(JSON.stringify({
                type: 'error',
                payload: { message: `Target device ${targetDeviceId} is offline` }
              }));
            }
          }
          return;
        }

        if (message && typeof message.command === 'string') {
          const forwarded = {
            type: 'command',
            sourceDeviceId: primaryDeviceId,
            payload: message,
          };

          connectedDevices.forEach((targetWs, deviceId) => {
            if (deviceId === primaryDeviceId) {
              return;
            }

            if (targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify(forwarded));
            }
          });

          return;
        }

        const typedMessage = message as WsMessage;
        const incomingType = getStringField(typedMessage, 'type', 'Type')?.toLowerCase();

        if (incomingType === 'client_ready' || incomingType === 'client.ready') {
          const readyDeviceId = getStringField((typedMessage as any).payload, 'deviceId', 'DeviceId') || primaryDeviceId;
          if (readyDeviceId) {
            readyMobileDevices.add(readyDeviceId);
            console.log(`[SERVER] mobile ready ${readyDeviceId}`);
            broadcastDeviceReady(readyDeviceId, true);
            flushPendingClipboard(readyDeviceId);
          }
          return;
        }

        if (incomingType === 'ping') {
          ws.send(JSON.stringify({
            type: 'pong',
            payload: {
              timestamp: Date.now(),
              deviceId: primaryDeviceId
            }
          }));
          return;
        }
        
        switch (typedMessage.type) {
          case WS_EVENTS.REGISTER: {
            const payload = typedMessage.payload as any;
            const deviceId = getStringField(payload, 'deviceId', 'DeviceId');
            if (!deviceId) {
              ws.send(JSON.stringify({
                type: 'error',
                payload: { message: 'Missing deviceId in register payload' }
              }));
              break;
            }

            if (!primaryDeviceId) {
              primaryDeviceId = deviceId;
            }

            const platform = getStringField(payload, 'platform', 'Platform')?.toLowerCase() ?? 'unknown';
            devicePlatforms.set(deviceId, platform);

            socketPrimaryDeviceIds.set(ws, deviceId);

            bindDeviceId(deviceId);

            const aliasCandidates = Array.isArray(payload?.aliases)
              ? payload.aliases.filter((x: unknown) => typeof x === 'string').map((x: string) => x.trim()).filter(Boolean)
              : [];

            for (const alias of aliasCandidates) {
              bindDeviceId(alias);
              devicePlatforms.set(alias, platform);
            }

            await storage.updateDeviceStatus(deviceId, 'online');
            await recordConnectionStarted(deviceId);
            broadcastDeviceStatus(deviceId, 'online');
            sendOnlineSnapshotToCurrentSocket(deviceId);
            if (readyMobileDevices.has(deviceId)) {
              flushPendingClipboard(deviceId);
            }
            console.log(`[SERVER] device connected ${deviceId}`);
            
            // Broadcast status change to peers/dashboard
            console.log(`Device ${deviceId} registered via WS`);
            break;
          }
          
          case WS_EVENTS.OFFER:
          case WS_EVENTS.ANSWER:
          case WS_EVENTS.ICE_CANDIDATE:
          case WS_EVENTS.CONNECTION_REQUEST:
          case WS_EVENTS.SCREEN_SHARE_START:
          case WS_EVENTS.SCREEN_SHARE_STOP: {
            // Forward signaling messages and screen share commands to target device
            const { targetDeviceId } = typedMessage.payload as { targetDeviceId: string };
            const targetWs = connectedDevices.get(targetDeviceId);
            
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify(typedMessage));
            } else {
              ws.send(JSON.stringify({
                type: 'error',
                payload: { message: `Target device ${targetDeviceId} is offline` }
              }));
            }
            break;
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', async () => {
      const actuallyDisconnectedIds: string[] = [];

      boundDeviceIds.forEach((id) => {
        if (unbindDeviceIdIfOwnedByCurrentSocket(id)) {
          actuallyDisconnectedIds.push(id);
          devicePlatforms.delete(id);
        }
      });

      const primaryWasDisconnected = !!primaryDeviceId && actuallyDisconnectedIds.includes(primaryDeviceId);

      if (primaryDeviceId && primaryWasDisconnected) {
        readyMobileDevices.delete(primaryDeviceId);

        try {
          await storage.updateDeviceStatus(primaryDeviceId, 'offline');
          await recordConnectionEnded('socket_closed');
          broadcastDeviceReady(primaryDeviceId, false);
          broadcastDeviceStatus(primaryDeviceId, 'offline');
        } catch (err) {
          console.error('Failed to update device status on disconnect:', err);
        }
        console.log(`Device ${primaryDeviceId} disconnected`);
      } else if (primaryDeviceId) {
        console.log(`[SERVER] stale socket closed for ${primaryDeviceId}; active mapping retained`);
      }

      socketPrimaryDeviceIds.delete(ws);
    });

    ws.on('error', async (err) => {
      console.error('WebSocket connection error:', err);
      await recordConnectionEnded('socket_error');
    });
  });
}
