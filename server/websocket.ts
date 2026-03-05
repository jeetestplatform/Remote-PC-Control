import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import { storage } from './storage';
import { WS_EVENTS, type WsMessage } from '@shared/schema';

// Maps deviceId to WebSocket connection
const connectedDevices = new Map<string, WebSocket>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let currentDeviceId: string | null = null;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as any;

        if (message && typeof message.targetDeviceId === 'string') {
          const targetWs = connectedDevices.get(message.targetDeviceId);

          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            const forwarded = {
              ...message,
              sourceDeviceId: typeof message.sourceDeviceId === 'string' ? message.sourceDeviceId : currentDeviceId,
            };
            targetWs.send(JSON.stringify(forwarded));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: `Target device ${message.targetDeviceId} is offline` }
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
            const { deviceId } = typedMessage.payload as { deviceId: string };
            currentDeviceId = deviceId;
            connectedDevices.set(deviceId, ws);
            await storage.updateDeviceStatus(deviceId, 'online');
            
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
        } catch (err) {
          console.error('Failed to update device status on disconnect:', err);
        }
        console.log(`Device ${currentDeviceId} disconnected`);
      }
    });
  });
}
