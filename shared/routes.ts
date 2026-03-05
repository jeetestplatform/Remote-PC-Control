import { z } from 'zod';
import { insertUserSchema, users, devices, pairings } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/login' as const,
      input: insertUserSchema,
      responses: {
        200: z.object({
          token: z.string(),
          user: z.object({ id: z.number(), username: z.string() })
        }),
        401: errorSchemas.unauthorized,
      },
    },
    register: {
      method: 'POST' as const,
      path: '/api/register' as const,
      input: insertUserSchema,
      responses: {
        201: z.object({
          token: z.string(),
          user: z.object({ id: z.number(), username: z.string() })
        }),
        400: errorSchemas.validation,
      },
    }
  },
  devices: {
    list: {
      method: 'GET' as const,
      path: '/api/devices' as const,
      responses: {
        200: z.array(z.custom<typeof devices.$inferSelect>()),
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/devices' as const,
      input: z.object({
        deviceId: z.string(),
        name: z.string(),
        os: z.string()
      }),
      responses: {
        201: z.custom<typeof devices.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/devices/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      }
    }
  },
  pairings: {
    create: {
      method: 'POST' as const,
      path: '/api/pair-device' as const,
      input: z.object({
        pcDeviceId: z.string(),
        mobileDeviceId: z.string()
      }),
      responses: {
        201: z.custom<typeof pairings.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    list: {
      method: 'GET' as const,
      path: '/api/pairings' as const,
      responses: {
        200: z.array(z.custom<typeof pairings.$inferSelect>()),
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
