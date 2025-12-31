/**
 * Shared TypeScript types for PAN system
 */

// Interaction proof structure sent from main app to signing iframe
export interface InteractionProof {
  type: "click" | "submit" | "keypress";
  timestamp: number; // Unix timestamp (ms) when interaction occurred
  freshness: number; // When proof was created
  target: string; // SHA-256 hash of target element
  actionContext: string; // Human-readable action description
  actionHash: string; // Hash of the action being performed
  position: {
    x: number;
    y: number;
  };
  trajectory: TrajectoryPoint[];
  velocity: number; // Pixels per millisecond
  acceleration: number; // Change in velocity
  nonce: string; // Single-use nonce from server
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  timestamp: number;
}

// Action to be signed
export interface Action {
  type: string;
  context: string;
  displayName: string;
  payload: unknown;
}

// Message from main app to signing iframe
export interface SigningRequest {
  type: "INIT" | "SIGN" | "GET_PUBLIC_KEY";
  requestId: string;
  action?: Action;
  proof?: InteractionProof;
  nonce?: string;
}

// Response from signing iframe to main app
export interface SigningResponse {
  requestId: string;
  success: boolean;
  publicKey?: JsonWebKey;
  signature?: string;
  error?: string;
}

// Session info stored in Redis
export interface Session {
  sessionId: string;
  userId: string;
  publicKey: string; // JWK format as string
  createdAt: number;
  lastAccess: number;
  ipAddress: string;
  userAgent: string;
  expiresAt: number;
}

// Login request payload
export interface LoginRequest {
  username: string;
  password: string;
  mfaCode?: string;
  publicKey: JsonWebKey;
}

// Login response
export interface LoginResponse {
  success: boolean;
  sessionId?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  expiresAt?: number;
  error?: string;
}

// API error response
export interface APIError {
  success: false;
  error: string;
  code: number;
  message: string;
  details?: Record<string, unknown>;
}

// Nonce response
export interface NonceResponse {
  nonce: string;
  expiresAt: number;
}
