import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions } from 'express';
import { sign, verify } from 'jsonwebtoken';
import { requireCookieSecure, requireStrongJwtSecret } from './config';

export const AUTH_COOKIE_NAME = 'rehab_session';
export const RESET_COOKIE_NAME = 'rehab_password_reset';
export const CSRF_COOKIE_NAME = 'rehab_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const AUTH_TOKEN_ISSUER = 'rehab-platform-api';
export const AUTH_TOKEN_AUDIENCE = 'rehab-platform-web';

type SessionPurpose = 'auth' | 'password-reset';

export type SessionTokenPayload = {
  sub: string;
  authSessionVersion: number;
  purpose: SessionPurpose;
};

export function createSessionToken(
  payload: SessionTokenPayload,
  expiresIn: '8h' | '15m',
) {
  return sign(payload, requireStrongJwtSecret(), {
    algorithm: 'HS256',
    issuer: AUTH_TOKEN_ISSUER,
    audience: AUTH_TOKEN_AUDIENCE,
    expiresIn,
  });
}

export function verifySessionToken(token: string): SessionTokenPayload {
  const payload: unknown = verify(token, requireStrongJwtSecret(), {
    algorithms: ['HS256'],
    issuer: AUTH_TOKEN_ISSUER,
    audience: AUTH_TOKEN_AUDIENCE,
  });
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('sub' in payload) ||
    typeof payload.sub !== 'string' ||
    !('authSessionVersion' in payload) ||
    typeof payload.authSessionVersion !== 'number' ||
    !('purpose' in payload) ||
    (payload.purpose !== 'auth' && payload.purpose !== 'password-reset')
  ) {
    throw new Error('Invalid session payload');
  }
  return {
    sub: payload.sub,
    authSessionVersion: payload.authSessionVersion,
    purpose: payload.purpose,
  };
}

export function createCsrfToken() {
  return randomBytes(32).toString('base64url');
}

export function isCsrfTokenValid(token?: string): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function parseCookies(cookieHeader?: string) {
  const cookies: Record<string, string> = {};
  for (const item of cookieHeader?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator < 1) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

export function csrfTokensMatch(cookieToken?: string, headerToken?: string) {
  if (!isCsrfTokenValid(cookieToken) || !isCsrfTokenValid(headerToken)) {
    return false;
  }
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  return (
    cookieBuffer.length === headerBuffer.length &&
    timingSafeEqual(cookieBuffer, headerBuffer)
  );
}

export function sessionCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: requireCookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

export function csrfCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: false,
    secure: requireCookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}
