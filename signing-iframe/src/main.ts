/**
 * Signing Context - Main entry point for the signing iframe
 * Handles postMessage communication with the main application
 */

import type {
  SigningRequest,
  SigningResponse,
  Action,
  InteractionProof,
} from "./types";
import {
  generateKeyPair,
  exportPublicKey,
  signData,
  createCanonicalMessage,
  arrayBufferToBase64,
} from "./crypto-service";
import { storeKeyPair, getKeyPair, deleteKeyPair } from "./key-storage";
import { validateProof } from "./proof-validator";

// CRITICAL: Only accept messages from the main application origin
// Configure via environment variable in production
const ALLOWED_ORIGINS: string[] = (() => {
  // Check for environment-configured origins (set during build)
  const envOrigins = (
    import.meta as unknown as { env?: { VITE_ALLOWED_ORIGINS?: string } }
  ).env?.VITE_ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  // Default development origins
  return [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://example.com",
    "https://www.example.com",
  ];
})();

// Environment check
const IS_PRODUCTION =
  (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE ===
    "production" || process.env.NODE_ENV === "production";

/**
 * Logger utility - suppresses debug logs in production
 */
const logger = {
  debug: (...args: unknown[]) => {
    if (!IS_PRODUCTION) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

/**
 * Initialize the signing context
 */
async function initialize(): Promise<void> {
  console.log("[Signing Iframe] Initializing...");

  // Set up message handler
  window.addEventListener("message", handleMessage);

  // Signal ready to parent - CRITICAL: Send to each allowed origin explicitly
  // Never use "*" as it broadcasts to any embedding page
  if (window.parent !== window) {
    ALLOWED_ORIGINS.forEach((origin) => {
      try {
        window.parent.postMessage({ type: "READY" }, origin);
      } catch {
        // Origin may not match, which is expected
      }
    });
  }

  if (!IS_PRODUCTION) {
    logger.debug("[Signing Iframe] Ready and listening for messages");
  }
}

/**
 * Handle incoming postMessage requests
 */
async function handleMessage(event: MessageEvent): Promise<void> {
  // CRITICAL: Validate origin
  if (!ALLOWED_ORIGINS.includes(event.origin)) {
    logger.warn(
      "[Signing Iframe] Rejected message from unauthorized origin:",
      event.origin
    );
    return;
  }

  const request = event.data as SigningRequest;

  if (!request || !request.type || !request.requestId) {
    logger.warn("[Signing Iframe] Invalid request format");
    return;
  }

  logger.debug("[Signing Iframe] Received request:", request.type);

  try {
    let response: SigningResponse;

    switch (request.type) {
      case "INIT":
        response = await handleInit(request.requestId);
        break;

      case "GET_PUBLIC_KEY":
        response = await handleGetPublicKey(request.requestId);
        break;

      case "SIGN":
        response = await handleSign(
          request.requestId,
          request.action!,
          request.proof!,
          request.nonce!
        );
        break;

      default:
        response = {
          requestId: request.requestId,
          success: false,
          error: `Unknown request type: ${(request as SigningRequest).type}`,
        };
    }

    // Send response back to main application
    event.source?.postMessage(response, { targetOrigin: event.origin });
  } catch (error) {
    const errorResponse: SigningResponse = {
      requestId: request.requestId,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
    event.source?.postMessage(errorResponse, { targetOrigin: event.origin });
  }
}

/**
 * Initialize a new session - generate and store key pair
 */
async function handleInit(requestId: string): Promise<SigningResponse> {
  logger.debug("[Signing Iframe] Generating new key pair...");

  // Delete any existing key pair
  await deleteKeyPair();

  // Generate new non-extractable key pair
  const keyPair = await generateKeyPair();

  // Store in IndexedDB
  await storeKeyPair(keyPair);

  // Export public key for server registration
  const publicKey = await exportPublicKey(keyPair.publicKey);

  logger.debug("[Signing Iframe] Key pair generated and stored");

  return {
    requestId,
    success: true,
    publicKey,
  };
}

/**
 * Get the current public key (if exists)
 */
async function handleGetPublicKey(requestId: string): Promise<SigningResponse> {
  const keyPair = await getKeyPair();

  if (!keyPair) {
    return {
      requestId,
      success: false,
      error: "No key pair found. Initialize first.",
    };
  }

  const publicKey = await exportPublicKey(keyPair.publicKey);

  return {
    requestId,
    success: true,
    publicKey,
  };
}

/**
 * Sign an action with the stored private key
 */
async function handleSign(
  requestId: string,
  action: Action,
  proof: InteractionProof,
  nonce: string
): Promise<SigningResponse> {
  // Validate the interaction proof
  const validation = validateProof(proof, action);
  if (!validation.valid) {
    logger.warn("[Signing Iframe] Proof validation failed:", validation.error);
    return {
      requestId,
      success: false,
      error: validation.error,
    };
  }

  // Get the key pair
  const keyPair = await getKeyPair();
  if (!keyPair) {
    return {
      requestId,
      success: false,
      error: "No key pair found. Initialize first.",
    };
  }

  // Create canonical message
  const message = createCanonicalMessage(action, proof, nonce);
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  // Sign the message
  const signature = await signData(keyPair.privateKey, data.buffer);
  const signatureBase64 = arrayBufferToBase64(signature);

  logger.debug("[Signing Iframe] Signed request successfully");

  return {
    requestId,
    success: true,
    signature: signatureBase64,
  };
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
