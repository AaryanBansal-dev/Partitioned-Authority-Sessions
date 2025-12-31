/**
 * Redis Session Store
 * Manages session storage with TTL-based expiration
 */

import Redis from "ioredis";
import type { Session } from "./types";

const SESSION_TTL = 86400; // 24 hours in seconds
const NONCE_TTL = 300; // 5 minutes in seconds

// Redis connection - falls back to in-memory if Redis not available
let redis: Redis | null = null;
const inMemoryStore = new Map<string, string>();
const inMemoryExpiry = new Map<string, number>();

export async function initRedis(): Promise<void> {
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
      retryStrategy: () => null, // Don't retry, fall back to in-memory
    });

    await redis.connect();
    console.log("[Redis] Connected successfully");
  } catch (error) {
    console.warn("[Redis] Connection failed, using in-memory store");
    redis = null;
  }
}

/**
 * Generate a session key
 */
function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Generate a nonce key
 */
function nonceKey(nonce: string): string {
  return `nonce:${nonce}`;
}

/**
 * Store a session
 */
export async function storeSession(session: Session): Promise<void> {
  const key = sessionKey(session.sessionId);
  const value = JSON.stringify(session);

  if (redis) {
    await redis.setex(key, SESSION_TTL, value);
  } else {
    inMemoryStore.set(key, value);
    inMemoryExpiry.set(key, Date.now() + SESSION_TTL * 1000);
  }
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const key = sessionKey(sessionId);

  let value: string | null = null;

  if (redis) {
    value = await redis.get(key);
  } else {
    const expiry = inMemoryExpiry.get(key);
    if (expiry && expiry > Date.now()) {
      value = inMemoryStore.get(key) || null;
    } else {
      inMemoryStore.delete(key);
      inMemoryExpiry.delete(key);
    }
  }

  if (!value) return null;

  try {
    return JSON.parse(value) as Session;
  } catch {
    return null;
  }
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const key = sessionKey(sessionId);

  if (redis) {
    await redis.del(key);
  } else {
    inMemoryStore.delete(key);
    inMemoryExpiry.delete(key);
  }
}

/**
 * Update session last access time
 */
export async function touchSession(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (session) {
    session.lastAccess = Date.now();
    await storeSession(session);
  }
}

/**
 * Store a nonce (single-use token)
 */
export async function storeNonce(nonce: string): Promise<void> {
  const key = nonceKey(nonce);

  if (redis) {
    await redis.setex(key, NONCE_TTL, "1");
  } else {
    inMemoryStore.set(key, "1");
    inMemoryExpiry.set(key, Date.now() + NONCE_TTL * 1000);
  }
}

/**
 * Validate and consume a nonce (atomic get-and-delete)
 * Returns true if nonce was valid and consumed, false otherwise
 */
export async function validateAndConsumeNonce(nonce: string): Promise<boolean> {
  const key = nonceKey(nonce);

  if (redis) {
    // Use GETDEL for atomic get-and-delete
    const result = await redis.getdel(key);
    return result === "1";
  } else {
    const expiry = inMemoryExpiry.get(key);
    if (expiry && expiry > Date.now() && inMemoryStore.get(key) === "1") {
      inMemoryStore.delete(key);
      inMemoryExpiry.delete(key);
      return true;
    }
    return false;
  }
}

/**
 * Generate a random nonce
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
