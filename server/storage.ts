import { db } from "./db";
import {
  users, devices, pairings, sessions,
  type User, type InsertUser, type Device, type InsertDevice,
  type Pairing, type InsertPairing, type Session
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getDevices(userId: number): Promise<Device[]>;
  getDeviceByDeviceId(deviceId: string): Promise<Device | undefined>;
  createDevice(device: InsertDevice): Promise<Device>;
  updateDeviceStatus(deviceId: string, status: string): Promise<void>;
  deleteDevice(id: number, userId: number): Promise<boolean>;

  getPairings(userId: number): Promise<Pairing[]>;
  createPairing(pairing: InsertPairing): Promise<Pairing>;
  
  createSession(userId: number, token: string, expiresAt: Date): Promise<Session>;
  getSession(token: string): Promise<Session | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getDevices(userId: number): Promise<Device[]> {
    return await db.select().from(devices).where(eq(devices.userId, userId));
  }

  async getDeviceByDeviceId(deviceId: string): Promise<Device | undefined> {
    const [device] = await db.select().from(devices).where(eq(devices.deviceId, deviceId));
    return device;
  }

  async createDevice(insertDevice: InsertDevice): Promise<Device> {
    const [device] = await db.insert(devices).values(insertDevice).returning();
    return device;
  }

  async updateDeviceStatus(deviceId: string, status: string): Promise<void> {
    await db.update(devices)
      .set({ status, lastSeen: new Date() })
      .where(eq(devices.deviceId, deviceId));
  }

  async deleteDevice(id: number, userId: number): Promise<boolean> {
    const [deleted] = await db.delete(devices)
      .where(and(eq(devices.id, id), eq(devices.userId, userId)))
      .returning();
    return !!deleted;
  }

  async getPairings(userId: number): Promise<Pairing[]> {
    return await db.select().from(pairings).where(eq(pairings.userId, userId));
  }

  async createPairing(insertPairing: InsertPairing): Promise<Pairing> {
    const [pairing] = await db.insert(pairings).values(insertPairing).returning();
    return pairing;
  }

  async createSession(userId: number, token: string, expiresAt: Date): Promise<Session> {
    const [session] = await db.insert(sessions).values({ userId, token, expiresAt }).returning();
    return session;
  }

  async getSession(token: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.token, token));
    return session;
  }
}

export const storage = new DatabaseStorage();
