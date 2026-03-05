import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { setupWebSocket } from "./websocket";

const JWT_SECRET = process.env.SESSION_SECRET || 'fallback_secret_key';

// Middleware for auth
async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    const session = await storage.getSession(token);
    if (!session || new Date() > session.expiresAt) {
      return res.status(401).json({ message: "Session expired or invalid" });
    }
    
    const user = await storage.getUser(decoded.userId);
    if (!user) return res.status(401).json({ message: "User not found" });

    (req as any).user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup WebSocket server for WebRTC signaling
  setupWebSocket(httpServer);

  app.post(api.auth.register.path, async (req, res) => {
    try {
      const { username, password } = api.auth.register.input.parse(req.body);
      
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ username, password: hashedPassword });
      
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await storage.createSession(user.id, token, expiresAt);

      res.status(201).json({ token, user: { id: user.id, username: user.username } });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const { username, password } = api.auth.login.input.parse(req.body);
      
      const user = await storage.getUserByUsername(username);
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      await storage.createSession(user.id, token, expiresAt);

      res.status(200).json({ token, user: { id: user.id, username: user.username } });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // Protected routes
  app.get(api.devices.list.path, authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const devices = await storage.getDevices(user.id);
    res.status(200).json(devices);
  });

  app.post(api.devices.create.path, authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const input = api.devices.create.input.parse(req.body);
      
      const existingDevice = await storage.getDeviceByDeviceId(input.deviceId);
      if (existingDevice) {
        return res.status(400).json({ message: "Device already registered" });
      }

      const device = await storage.createDevice({
        ...input,
        userId: user.id,
        status: 'offline'
      });
      
      res.status(201).json(device);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.delete(api.devices.delete.path, authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const deviceId = parseInt(rawId, 10);

    if (Number.isNaN(deviceId)) {
      return res.status(400).json({ message: "Invalid device id" });
    }
    
    const success = await storage.deleteDevice(deviceId, user.id);
    if (!success) {
      return res.status(404).json({ message: "Device not found" });
    }
    
    res.status(204).send();
  });

  app.get(api.pairings.list.path, authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const pairings = await storage.getPairings(user.id);
    res.status(200).json(pairings);
  });

  app.post(api.pairings.create.path, authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const input = api.pairings.create.input.parse(req.body);
      
      const pcDevice = await storage.getDeviceByDeviceId(input.pcDeviceId);
      const mobileDevice = await storage.getDeviceByDeviceId(input.mobileDeviceId);
      
      if (!pcDevice || !mobileDevice) {
        return res.status(400).json({ message: "One or both devices not found" });
      }
      
      if (pcDevice.userId !== user.id || mobileDevice.userId !== user.id) {
        return res.status(403).json({ message: "Unauthorized device access" });
      }

      const pairing = await storage.createPairing({
        userId: user.id,
        pcDeviceId: input.pcDeviceId,
        mobileDeviceId: input.mobileDeviceId,
        status: 'paired'
      });
      
      res.status(201).json(pairing);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  return httpServer;
}
