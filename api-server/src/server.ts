/**
 * PAN API Server
 * Bun HTTP server with signature verification
 */

import type {
  Session,
  LoginRequest,
  LoginResponse,
  InteractionProof,
  Action,
} from "./types";
import {
  initRedis,
  storeSession,
  getSession,
  deleteSession,
  touchSession,
  storeNonce,
  validateAndConsumeNonce,
  generateNonce,
} from "./store";
import { verifySignature } from "./crypto";
import { validateInteractionProof } from "./validator";

const PORT = parseInt(process.env.PORT || "8080");
const SESSION_TTL = 86400; // 24 hours

// CORS configuration
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://example.com",
];

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Handle CORS preflight and headers
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, X-Session-ID, X-Signature, X-Interaction-Proof",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * JSON response helper
 */
function jsonResponse(
  data: unknown,
  status = 200,
  origin: string | null = null
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

/**
 * Error response helper
 */
function errorResponse(
  message: string,
  status = 400,
  origin: string | null = null
): Response {
  return jsonResponse({ success: false, error: message }, status, origin);
}

/**
 * Verify a protected request
 */
async function verifyRequest(request: Request): Promise<{
  valid: boolean;
  session?: Session;
  error?: string;
}> {
  const sessionId = request.headers.get("X-Session-ID");
  const signature = request.headers.get("X-Signature");
  const proofJson = request.headers.get("X-Interaction-Proof");

  // Check required headers
  if (!sessionId) {
    return { valid: false, error: "Missing X-Session-ID header" };
  }
  if (!signature) {
    return { valid: false, error: "Missing X-Signature header" };
  }
  if (!proofJson) {
    return { valid: false, error: "Missing X-Interaction-Proof header" };
  }

  // Get session
  const session = await getSession(sessionId);
  if (!session) {
    return { valid: false, error: "Invalid or expired session" };
  }

  // Parse interaction proof
  let proof: InteractionProof;
  try {
    proof = JSON.parse(proofJson);
  } catch {
    return { valid: false, error: "Invalid interaction proof format" };
  }

  // Validate nonce (single-use)
  if (!proof.nonce) {
    return { valid: false, error: "Missing nonce in proof" };
  }

  const nonceValid = await validateAndConsumeNonce(proof.nonce);
  if (!nonceValid) {
    return { valid: false, error: "Invalid or reused nonce" };
  }

  // Parse action from request body
  let action: Action;
  let body: unknown;
  try {
    body = await request.clone().json();
    // The action structure is expected in the signed request
    action = {
      type: "api_call",
      context: new URL(request.url).pathname,
      displayName: proof.actionContext,
      payload: body,
    };
  } catch {
    return { valid: false, error: "Invalid request body" };
  }

  // Validate interaction proof
  const proofValidation = validateInteractionProof(proof, action);
  if (!proofValidation.valid) {
    return { valid: false, error: proofValidation.error };
  }

  // Verify cryptographic signature
  const signatureValid = await verifySignature(
    session.publicKey,
    signature,
    action,
    proof,
    proof.nonce
  );

  if (!signatureValid) {
    return { valid: false, error: "Signature verification failed" };
  }

  // Update session last access
  await touchSession(sessionId);

  return { valid: true, session };
}

/**
 * Main request handler
 */
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  const path = url.pathname;

  try {
    // === Public endpoints ===

    // Health check
    if (path === "/health" && request.method === "GET") {
      return jsonResponse({ status: "ok", timestamp: Date.now() }, 200, origin);
    }

    // Login
    if (path === "/api/auth/login" && request.method === "POST") {
      const body = (await request.json()) as LoginRequest;

      // In production, verify credentials against database
      // For demo, accept any credentials
      if (!body.username || !body.password || !body.publicKey) {
        return errorResponse("Missing required fields", 400, origin);
      }

      // Create session
      const sessionId = generateSessionId();
      const now = Date.now();

      const session: Session = {
        sessionId,
        userId: `user-${body.username.split("@")[0]}`,
        publicKey: JSON.stringify(body.publicKey),
        createdAt: now,
        lastAccess: now,
        ipAddress: request.headers.get("X-Forwarded-For") || "unknown",
        userAgent: request.headers.get("User-Agent") || "unknown",
        expiresAt: now + SESSION_TTL * 1000,
      };

      await storeSession(session);

      const response: LoginResponse = {
        success: true,
        sessionId,
        user: {
          id: session.userId,
          email: body.username,
          name: body.username.split("@")[0],
        },
        expiresAt: session.expiresAt,
      };

      console.log(
        `[Auth] Login successful for ${
          body.username
        }, session: ${sessionId.substring(0, 8)}...`
      );

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL}`,
          ...corsHeaders(origin),
        },
      });
    }

    // Logout
    if (path === "/api/auth/logout" && request.method === "POST") {
      const sessionId = request.headers.get("X-Session-ID");
      if (sessionId) {
        await deleteSession(sessionId);
        console.log(
          `[Auth] Logout for session: ${sessionId.substring(0, 8)}...`
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "session_id=; Path=/; Max-Age=0",
          ...corsHeaders(origin),
        },
      });
    }

    // Get nonce (requires session, but not signature)
    if (path === "/api/nonce" && request.method === "GET") {
      const nonce = generateNonce();
      await storeNonce(nonce);

      return jsonResponse(
        {
          nonce,
          expiresAt: Date.now() + 300000, // 5 minutes
        },
        200,
        origin
      );
    }

    // Session info (light verification)
    if (path === "/api/session/info" && request.method === "GET") {
      const sessionId = request.headers.get("X-Session-ID");
      if (!sessionId) {
        return errorResponse("Missing session ID", 401, origin);
      }

      const session = await getSession(sessionId);
      if (!session) {
        return errorResponse("Session not found", 401, origin);
      }

      return jsonResponse(
        {
          sessionId: session.sessionId,
          userId: session.userId,
          createdAt: session.createdAt,
          lastAccess: session.lastAccess,
          expiresAt: session.expiresAt,
        },
        200,
        origin
      );
    }

    // === Protected endpoints (require signature verification) ===

    if (path === "/api/protected/action" && request.method === "POST") {
      const verification = await verifyRequest(request);

      if (!verification.valid) {
        console.warn(`[Protected] Request rejected: ${verification.error}`);
        return errorResponse(
          verification.error || "Verification failed",
          401,
          origin
        );
      }

      const body = await request.clone().json();

      console.log(
        `[Protected] Action executed for user ${verification.session!.userId}:`,
        body
      );

      return jsonResponse(
        {
          success: true,
          message: `Action "${
            (body as Record<string, unknown>).action || "unknown"
          }" executed successfully`,
          timestamp: Date.now(),
        },
        200,
        origin
      );
    }

    // 404 for unmatched routes
    return errorResponse("Not found", 404, origin);
  } catch (error) {
    console.error("[Server] Error:", error);
    return errorResponse("Internal server error", 500, origin);
  }
}

/**
 * Start the server
 */
async function main(): Promise<void> {
  console.log("[Server] Initializing...");

  await initRedis();

  const server = Bun.serve({
    port: PORT,
    fetch: handleRequest,
  });

  console.log(
    `[Server] PAN API Server running on http://localhost:${server.port}`
  );
  console.log("[Server] Endpoints:");
  console.log("  POST /api/auth/login    - Authenticate and create session");
  console.log("  POST /api/auth/logout   - Terminate session");
  console.log("  GET  /api/nonce         - Get fresh nonce for signing");
  console.log("  GET  /api/session/info  - Get session information");
  console.log(
    "  POST /api/protected/*   - Protected endpoints (require signature)"
  );
}

main().catch(console.error);
