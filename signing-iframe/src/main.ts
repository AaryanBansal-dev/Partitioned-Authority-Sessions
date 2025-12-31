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
// In production, this should be the exact main application domain
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://example.com",
  "https://www.example.com",
];

/**
 * Initialize the signing context
 */
async function initialize(): Promise<void> {
  console.log("[Signing Iframe] Initializing...");

  // Set up message handler
  window.addEventListener("message", handleMessage);

  // Signal ready to parent
  if (window.parent !== window) {
    window.parent.postMessage({ type: "READY" }, "*");
  }

  console.log("[Signing Iframe] Ready and listening for messages");
}

/**
 * Handle incoming postMessage requests
 */
async function handleMessage(event: MessageEvent): Promise<void> {
  // CRITICAL: Validate origin
  if (!ALLOWED_ORIGINS.includes(event.origin)) {
    console.warn(
      "[Signing Iframe] Rejected message from unauthorized origin:",
      event.origin
    );
    return;
  }

  const request = event.data as SigningRequest;

  if (!request || !request.type || !request.requestId) {
    console.warn("[Signing Iframe] Invalid request format");
    return;
  }

  console.log("[Signing Iframe] Received request:", request.type);

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
  console.log("[Signing Iframe] Generating new key pair...");

  // Delete any existing key pair
  await deleteKeyPair();

  // Generate new non-extractable key pair
  const keyPair = await generateKeyPair();

  // Store in IndexedDB
  await storeKeyPair(keyPair);

  // Export public key for server registration
  const publicKey = await exportPublicKey(keyPair.publicKey);

  console.log("[Signing Iframe] Key pair generated and stored");

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
    console.warn("[Signing Iframe] Proof validation failed:", validation.error);
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

  console.log("[Signing Iframe] Signed request successfully");

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
