/**
 * Session Manager - Handles session state and cookie management
 */

import type { LoginRequest, LoginResponse, NonceResponse } from "./types";

// Configuration from environment (set during build)
const API_BASE =
  (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env
    ?.VITE_API_BASE || "http://localhost:8080";
const IS_PRODUCTION =
  (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE ===
  "production";

export class SessionManager {
  private sessionId: string | null = null;
  private user: { id: string; email: string; name: string } | null = null;
  private publicKey: JsonWebKey | null = null;

  constructor() {
    // Try to restore session from cookie
    this.sessionId = this.getSessionIdFromCookie();
  }

  /**
   * Get session ID from cookie
   */
  private getSessionIdFromCookie(): string | null {
    const match = document.cookie.match(/session_id=([^;]+)/);
    return match ? match[1] : null;
  }

  /**
   * Check if user is logged in
   */
  public isLoggedIn(): boolean {
    return this.sessionId !== null;
  }

  /**
   * Get the current session ID
   */
  public getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get the current user
   */
  public getUser(): { id: string; email: string; name: string } | null {
    return this.user;
  }

  /**
   * Store the public key after initialization
   */
  public setPublicKey(key: JsonWebKey): void {
    this.publicKey = key;
  }

  /**
   * Get the stored public key
   */
  public getPublicKey(): JsonWebKey | null {
    return this.publicKey;
  }

  /**
   * Login with credentials and public key
   */
  public async login(
    username: string,
    password: string,
    publicKey: JsonWebKey,
    mfaCode?: string
  ): Promise<LoginResponse> {
    const request: LoginRequest = {
      username,
      password,
      publicKey,
      mfaCode,
    };

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        credentials: "include", // Include cookies
      });

      const data: LoginResponse = await response.json();

      if (data.success && data.sessionId) {
        this.sessionId = data.sessionId;
        this.user = data.user || null;
        this.publicKey = publicKey;
        console.log("[SessionManager] Login successful");
      }

      return data;
    } catch (error) {
      console.error("[SessionManager] Login failed:", error);
      throw error;
    }
  }

  /**
   * Logout and clear session
   */
  public async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("[SessionManager] Logout request failed:", error);
    }

    // Clear local state regardless
    this.sessionId = null;
    this.user = null;
    this.publicKey = null;

    // Clear cookie
    document.cookie = "session_id=; Max-Age=0; path=/";

    console.log("[SessionManager] Logged out");
  }

  /**
   * Fetch a nonce from the server for signing
   */
  public async fetchNonce(): Promise<string> {
    try {
      const response = await fetch(`${API_BASE}/api/nonce`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch nonce");
      }

      const data: NonceResponse = await response.json();
      return data.nonce;
    } catch (error) {
      console.error("[SessionManager] Failed to fetch nonce:", error);
      throw error;
    }
  }
}

// Global instance
export const sessionManager = new SessionManager();
