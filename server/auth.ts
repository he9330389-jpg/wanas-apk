// Password hashing (scrypt) and signed session tokens (HMAC-SHA256). No external dependencies.
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;

const N = 16384;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [kind, n, saltB64, keyB64] = stored.split('$');
    if (kind !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = await scrypt(password, salt, expected.length, { N: Number(n), r: 8, p: 1 });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const b64u = (b: Buffer) => b.toString('base64url');

export function signToken(payload: any, secret?: string, ttlMs = 1000 * 60 * 60 * 24 * 90): string {
  const sec = secret || process.env.JWT_SECRET || 'wanas-secret-key-2024';
  const body = b64u(Buffer.from(JSON.stringify({ u: payload.userId || payload, e: Date.now() + ttlMs })));
  const sig = b64u(crypto.createHmac('sha256', sec).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token: string | undefined | null, secret?: string): string | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const sec = secret || process.env.JWT_SECRET || 'wanas-secret-key-2024';
  const expected = b64u(crypto.createHmac('sha256', sec).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as { u: string; e: number };
    if (!parsed.u || parsed.e < Date.now()) return null;
    return parsed.u;
  } catch {
    return null;
  }
}

export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.set(key, list);
    return true;
  };
}
