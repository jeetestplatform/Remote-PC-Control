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

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const getStringField = (obj: any, ...keys: string[]): string | null => {
    for (const key of keys) {
      if (obj && typeof obj[key] === 'string' && obj[key].trim().length > 0) {
        return obj[key];
      }
    }
    return null;
  };

  // Keep-alive: send ping to all connected clients every 30 seconds
  setInterval(() => {
    connectedDevices.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30_000);  // 30 seconds

  wss.on('connection', (ws) => {
    let primaryDeviceId: string | null = null;
    const boundDeviceIds = new Set<string>();
    let currentConnectionSessionId: number | null = null;

    // Handle pong responses from client
    ws.on('pong', () => {
      // Connection is still active
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
      connectedDevices.set(deviceId, ws);
      boundDeviceIds.add(deviceId);
    };

    const isClipboardForward = (payload: any): boolean => {
      const command = getStringField(payload, 'command', 'Command');
      return !!command && (command.toLowerCase() === 'clipboard.sync' || command.toLowerCase() === 'clipboard');
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
      try {
        const message = JSON.parse(data.toString()) as any;
        const targetDeviceId = getStringField(message, 'targetDeviceId', 'TargetDeviceId');

        if (targetDeviceId) {
          const payload = message?.payload ?? message?.Payload;
          const sourceDeviceId = getStringField(message, 'sourceDeviceId', 'SourceDeviceId') ?? primaryDeviceId;
          const outgoingType = getStringField(message, 'type', 'Type') ?? 'command';

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
            readyMobileDevices.delete(deviceId);
            pendingClipboardByDevice.delete(deviceId);
            console.log(`[SERVER] mobile connected ${deviceId}`);
            
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
      for (const id of boundDeviceIds) {
        connectedDevices.delete(id);
        readyMobileDevices.delete(id);
        pendingClipboardByDevice.delete(id);
        devicePlatforms.delete(id);
      }

      if (primaryDeviceId) {
        try {
          await storage.updateDeviceStatus(primaryDeviceId, 'offline');
          await recordConnectionEnded('socket_closed');
          broadcastDeviceReady(primaryDeviceId, false);
          broadcastDeviceStatus(primaryDeviceId, 'offline');
        } catch (err) {
          console.error('Failed to update device status on disconnect:', err);
        }
        console.log(`Device ${primaryDeviceId} disconnected`);
      }

      socketPrimaryDeviceIds.delete(ws);
    });

    ws.on('error', async (err) => {
      console.error('WebSocket connection error:', err);
      await recordConnectionEnded('socket_error');
    });
  });
}
