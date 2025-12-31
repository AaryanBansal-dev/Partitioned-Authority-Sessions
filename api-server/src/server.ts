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
  checkRateLimit,
  incrementRateLimit,
} from "./store";
import { verifySignature } from "./crypto";
import { validateInteractionProof } from "./validator";

// Configuration from environment
const PORT = parseInt(process.env.PORT || "8080");
const SESSION_TTL = parseInt(process.env.SESSION_TTL || "86400"); // 24 hours
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const HTTPS_ENABLED = process.env.HTTPS_ENABLED === "true" || IS_PRODUCTION;

// CORS configuration from environment
const ALLOWED_ORIGINS: string[] = (() => {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://example.com",
  ];
})();

// Rate limiting configuration
const NONCE_RATE_LIMIT = parseInt(process.env.NONCE_RATE_LIMIT || "30"); // per minute
const LOGIN_RATE_LIMIT = parseInt(process.env.LOGIN_RATE_LIMIT || "10"); // per minute

/**
 * Logger utility - suppresses logs in production unless explicitly enabled
 */
const logger = {
  debug: (...args: unknown[]) => {
    if (!IS_PRODUCTION || process.env.DEBUG === "true") {
      console.log(...args);
    }
  },
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

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
/**
 * Security headers for all responses
 */
function securityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  };

  // Add HSTS in production
  if (HTTPS_ENABLED) {
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains";
  }

  return headers;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    ...securityHeaders(),
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
      const clientIP =
        request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
        "unknown";

      // Rate limiting for login attempts
      const rateLimitKey = `login:${clientIP}`;
      const isRateLimited = await checkRateLimit(
        rateLimitKey,
        LOGIN_RATE_LIMIT
      );
      if (isRateLimited) {
        logger.warn(`[Auth] Rate limited login attempt from ${clientIP}`);
        return errorResponse(
          "Too many login attempts. Please try again later.",
          429,
          origin
        );
      }
      await incrementRateLimit(rateLimitKey);

      const body = (await request.json()) as LoginRequest;

      // Input validation
      if (!body.username || typeof body.username !== "string") {
        return errorResponse("Username is required", 400, origin);
      }
      if (!body.password || typeof body.password !== "string") {
        return errorResponse("Password is required", 400, origin);
      }
      if (!body.publicKey || typeof body.publicKey !== "object") {
        return errorResponse("Public key is required", 400, origin);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.username)) {
        return errorResponse("Invalid email format", 400, origin);
      }

      // Validate password length
      if (body.password.length < 8) {
        return errorResponse(
          "Password must be at least 8 characters",
          400,
          origin
        );
      }

      // Validate public key structure (basic JWK validation)
      const jwk = body.publicKey as Record<string, unknown>;
      if (!jwk.kty || jwk.kty !== "EC" || !jwk.crv || !jwk.x || !jwk.y) {
        return errorResponse(
          "Invalid public key format. Expected ECDSA P-256 JWK.",
          400,
          origin
        );
      }

      // TODO: In production, verify credentials against database
      // const user = await verifyCredentials(body.username, body.password);
      // if (!user) {
      //   return errorResponse("Invalid credentials", 401, origin);
      // }

      // Create session
      const sessionId = generateSessionId();
      const now = Date.now();

      const session: Session = {
        sessionId,
        userId: `user-${body.username.split("@")[0]}`,
        publicKey: JSON.stringify(body.publicKey),
        createdAt: now,
        lastAccess: now,
        ipAddress: clientIP,
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

      logger.debug(
        `[Auth] Login successful for ${
          body.username
        }, session: ${sessionId.substring(0, 8)}...`
      );

      // Build cookie with proper security flags
      const cookieFlags = [
        `session_id=${sessionId}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        `Max-Age=${SESSION_TTL}`,
      ];

      // Add Secure flag for HTTPS environments
      if (HTTPS_ENABLED) {
        cookieFlags.push("Secure");
      }

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookieFlags.join("; "),
          ...corsHeaders(origin),
        },
      });
    }

    // Logout
    if (path === "/api/auth/logout" && request.method === "POST") {
      const sessionId = request.headers.get("X-Session-ID");
      if (sessionId) {
        await deleteSession(sessionId);
        logger.debug(
          `[Auth] Logout for session: ${sessionId.substring(0, 8)}...`
        );
      }

      // Build logout cookie with proper security flags
      const logoutCookieFlags = ["session_id=", "Path=/", "Max-Age=0"];
      if (HTTPS_ENABLED) {
        logoutCookieFlags.push("Secure");
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": logoutCookieFlags.join("; "),
          ...corsHeaders(origin),
        },
      });
    }

    // Get nonce (requires valid session and rate limiting)
    if (path === "/api/nonce" && request.method === "GET") {
      // Require a valid session for nonce generation
      const sessionId = request.headers.get("X-Session-ID");
      if (!sessionId) {
        return errorResponse("Session ID required", 401, origin);
      }

      const session = await getSession(sessionId);
      if (!session) {
        return errorResponse("Invalid or expired session", 401, origin);
      }

      // Rate limiting for nonce requests
      const rateLimitKey = `nonce:${sessionId}`;
      const isRateLimited = await checkRateLimit(
        rateLimitKey,
        NONCE_RATE_LIMIT
      );
      if (isRateLimited) {
        logger.warn(
          `[Nonce] Rate limited for session: ${sessionId.substring(0, 8)}...`
        );
        return errorResponse(
          "Too many nonce requests. Please slow down.",
          429,
          origin
        );
      }
      await incrementRateLimit(rateLimitKey);

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

      logger.debug(
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
    // Log error details server-side but don't expose to client
    logger.error(
      "[Server] Error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return errorResponse("Internal server error", 500, origin);
  }
}

/**
 * Start the server
 */
async function main(): Promise<void> {
  logger.info("[Server] Initializing...");

  await initRedis();

  const server = Bun.serve({
    port: PORT,
    fetch: handleRequest,
  });

  logger.info(
    `[Server] PAN API Server running on http://localhost:${server.port}`
  );
  logger.info("[Server] Endpoints:");
  logger.info("  POST /api/auth/login    - Authenticate and create session");
  logger.info("  POST /api/auth/logout   - Terminate session");
  logger.info("  GET  /api/nonce         - Get fresh nonce for signing");
  logger.info("  GET  /api/session/info  - Get session information");
  logger.info(
    "  POST /api/protected/*   - Protected endpoints (require signature)"
  );
  logger.info(
    `[Server] Security: HTTPS=${HTTPS_ENABLED}, Rate limiting enabled`
  );
}

main().catch(logger.error);
