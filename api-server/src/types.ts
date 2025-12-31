/**
 * Shared types for the API server
 */

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

export interface InteractionProof {
  type: "click" | "submit" | "keypress";
  timestamp: number;
  freshness: number;
  target: string;
  actionContext: string;
  actionHash: string;
  position: { x: number; y: number };
  trajectory: Array<{ x: number; y: number; timestamp: number }>;
  velocity: number;
  acceleration: number;
  nonce: string;
}

export interface Action {
  type: string;
  context: string;
  displayName: string;
  payload: unknown;
}

export interface LoginRequest {
  username: string;
  password: string;
  mfaCode?: string;
  publicKey: JsonWebKey;
}

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

export interface VerifiedRequest {
  session: Session;
  proof: InteractionProof;
}
