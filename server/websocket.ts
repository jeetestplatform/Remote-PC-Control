import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import { storage } from './storage';
import { WS_EVENTS, type WsMessage } from '@shared/schema';
import { db } from './db';
import { sql } from 'drizzle-orm';

// Maps deviceId to WebSocket connection
const connectedDevices = new Map<string, WebSocket>();

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

  wss.on('connection', (ws) => {
    let currentDeviceId: string | null = null;
    let currentConnectionSessionId: number | null = null;

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
        } else if (currentDeviceId) {
          await db.execute(sql`
            UPDATE connection_sessions
            SET disconnected_at = NOW(), close_reason = ${reason}
            WHERE device_id = ${currentDeviceId} AND disconnected_at IS NULL
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

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as any;
        const targetDeviceId = getStringField(message, 'targetDeviceId', 'TargetDeviceId');

        if (targetDeviceId) {
          const payload = message?.payload ?? message?.Payload;
          const sourceDeviceId = getStringField(message, 'sourceDeviceId', 'SourceDeviceId') ?? currentDeviceId;
          const outgoingType = getStringField(message, 'type', 'Type') ?? 'command';

          const targetWs = connectedDevices.get(targetDeviceId);

          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            const forwarded = {
              ...message,
              type: outgoingType,
              targetDeviceId,
              sourceDeviceId,
              payload,
            };
            targetWs.send(JSON.stringify(forwarded));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: `Target device ${targetDeviceId} is offline` }
            }));
          }
          return;
        }

        if (message && typeof message.command === 'string') {
          const forwarded = {
            type: 'command',
            sourceDeviceId: currentDeviceId,
            payload: message,
          };

          connectedDevices.forEach((targetWs, deviceId) => {
            if (deviceId === currentDeviceId) {
              return;
            }

            if (targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify(forwarded));
            }
          });

          return;
        }

        const typedMessage = message as WsMessage;
        
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
            currentDeviceId = deviceId;
            connectedDevices.set(deviceId, ws);
            await storage.updateDeviceStatus(deviceId, 'online');
            await recordConnectionStarted(deviceId);
            broadcastDeviceStatus(deviceId, 'online');
            
            // Broadcast status change to peers/dashboard
            console.log(`Device ${deviceId} registered via WS`);
            break;
          }
          
          case WS_EVENTS.OFFER:
          case WS_EVENTS.ANSWER:
          case WS_EVENTS.ICE_CANDIDATE:
          case WS_EVENTS.CONNECTION_REQUEST: {
            // Forward signaling messages to target device
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
      if (currentDeviceId) {
        connectedDevices.delete(currentDeviceId);
        try {
          await storage.updateDeviceStatus(currentDeviceId, 'offline');
          await recordConnectionEnded('socket_closed');
          broadcastDeviceStatus(currentDeviceId, 'offline');
        } catch (err) {
          console.error('Failed to update device status on disconnect:', err);
        }
        console.log(`Device ${currentDeviceId} disconnected`);
      }
    });

    ws.on('error', async (err) => {
      console.error('WebSocket connection error:', err);
      await recordConnectionEnded('socket_error');
    });
  });
}
