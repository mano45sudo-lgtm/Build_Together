import type { Request } from 'express';
import type { RequestMeta } from '../services/auth.service.js';

/**
 * Extract the non-secret request context a session row records for device binding / forensics.
 * Kept in one place so the (proxied) client IP and UA string are handled identically everywhere.
 */
export function requestMeta(req: Request): RequestMeta {
  const userAgent = req.header('user-agent');
  return {
    ...(userAgent ? { userAgent: userAgent.slice(0, 300) } : {}),
    ...(req.ip ? { ip: req.ip } : {}),
  };
}
