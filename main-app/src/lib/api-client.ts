/**
 * API Client - Makes authenticated requests with PAN signatures
 */

import type { Action, InteractionProof } from "./types";
import { signingClient } from "./signing-client";
import { sessionManager } from "./session-manager";
import { interactionTracker } from "./interaction-tracker";

// Configuration from environment (set during build)
const API_BASE =
  (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env
    ?.VITE_API_BASE || "http://localhost:8080";
const IS_PRODUCTION =
  (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE ===
  "production";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  requiresSignature?: boolean;
}

export class APIClient {
  /**
   * Make a signed API request
   */
  public async request<T>(
    endpoint: string,
    action: Action,
    options: RequestOptions = {}
  ): Promise<T> {
    const { method = "POST", body, requiresSignature = true } = options;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add session ID header
    const sessionId = sessionManager.getSessionId();
    if (sessionId) {
      headers["X-Session-ID"] = sessionId;
    }

    // For signed requests, get interaction proof and signature
    if (requiresSignature) {
      // Fetch a fresh nonce
      const nonce = await sessionManager.fetchNonce();

      // Get interaction proof
      const proof = interactionTracker.getInteractionProof(action, nonce);
      if (!proof) {
        throw new Error(
          "No valid user interaction for this action. Please try clicking the button again."
        );
      }

      // Get signature from signing iframe
      const signature = await signingClient.sign(action, proof, nonce);

      // Add signature headers
      headers["X-Signature"] = signature;
      headers["X-Interaction-Proof"] = JSON.stringify(proof);
    }

    // Make the request
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Request failed" }));
      throw new Error(
        error.message || `Request failed with status ${response.status}`
      );
    }

    return response.json();
  }

  /**
   * Make an unsigned read-only request
   */
  public async get<T>(endpoint: string): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const sessionId = sessionManager.getSessionId();
    if (sessionId) {
      headers["X-Session-ID"] = sessionId;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "GET",
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Request failed" }));
      throw new Error(
        error.message || `Request failed with status ${response.status}`
      );
    }

    return response.json();
  }
}

// Global instance
export const apiClient = new APIClient();

/**
 * Helper function to perform a protected action
 * This is the main entry point for making signed API calls
 */
export async function performSecureAction<T>(
  endpoint: string,
  actionDisplayName: string,
  payload: unknown
): Promise<T> {
  const action: Action = {
    type: "api_call",
    context: endpoint,
    displayName: actionDisplayName,
    payload,
  };

  return apiClient.request<T>(endpoint, action, {
    method: "POST",
    body: payload,
  });
}
