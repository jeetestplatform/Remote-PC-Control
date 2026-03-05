import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: text("device_id").notNull().unique(),
  name: text("name").notNull(),
  os: text("os").notNull(), // 'windows' | 'android'
  status: text("status").notNull().default('offline'),
  lastSeen: timestamp("last_seen").defaultNow(),
});

export const pairings = pgTable("pairings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  pcDeviceId: text("pc_device_id").notNull(),
  mobileDeviceId: text("mobile_device_id").notNull(),
  status: text("status").notNull().default('paired'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertDeviceSchema = createInsertSchema(devices).omit({ id: true, lastSeen: true });
export const insertPairingSchema = createInsertSchema(pairings).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Pairing = typeof pairings.$inferSelect;
export type InsertPairing = z.infer<typeof insertPairingSchema>;
export type Session = typeof sessions.$inferSelect;

export const WS_EVENTS = {
  REGISTER: 'register',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
  CONNECTION_REQUEST: 'connection-request',
  DEVICE_STATUS: 'device-status'
} as const;

export interface WsMessage<T = any> {
  type: typeof WS_EVENTS[keyof typeof WS_EVENTS];
  payload: T;
}
