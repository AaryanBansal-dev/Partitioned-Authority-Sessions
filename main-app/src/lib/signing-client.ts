/**
 * Signing Client - Communication with the signing iframe via postMessage
 */

import type {
  SigningRequest,
  SigningResponse,
  Action,
  InteractionProof,
} from "./types";

// Signing iframe origin - in production this would be a subdomain
const SIGNING_IFRAME_URL = "http://localhost:3001";

export class SigningClient {
  private iframe: HTMLIFrameElement | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (response: SigningResponse) => void;
      reject: (error: Error) => void;
      timeout: number;
    }
  >();
  private isReady = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    this.setupIframe();
    this.setupMessageHandler();
  }

  /**
   * Create and embed the signing iframe
   */
  private setupIframe(): void {
    // Check if iframe already exists
    const existing = document.getElementById(
      "pan-signing-iframe"
    ) as HTMLIFrameElement;
    if (existing) {
      this.iframe = existing;
      return;
    }

    // Create invisible iframe
    this.iframe = document.createElement("iframe");
    this.iframe.id = "pan-signing-iframe";
    this.iframe.src = SIGNING_IFRAME_URL;
    this.iframe.style.cssText = `
      position: fixed;
      width: 1px;
      height: 1px;
      bottom: 0;
      right: 0;
      border: none;
      opacity: 0;
      pointer-events: none;
    `;

    document.body.appendChild(this.iframe);
    console.log("[SigningClient] Iframe embedded");
  }

  /**
   * Set up message handler for iframe responses
   */
  private setupMessageHandler(): void {
    window.addEventListener("message", (event) => {
      // Only accept messages from the signing iframe origin
      if (event.origin !== new URL(SIGNING_IFRAME_URL).origin) {
        return;
      }

      const data = event.data;

      // Handle ready signal
      if (data.type === "READY") {
        console.log("[SigningClient] Signing iframe is ready");
        this.isReady = true;
        this.readyResolve();
        return;
      }

      // Handle response to pending request
      if (data.requestId) {
        const pending = this.pendingRequests.get(data.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(data.requestId);
          pending.resolve(data as SigningResponse);
        }
      }
    });
  }

  /**
   * Wait for the iframe to be ready
   */
  public async waitReady(): Promise<void> {
    // Set a timeout in case the iframe fails to load
    const timeout = new Promise<void>((_, reject) => {
      setTimeout(
        () => reject(new Error("Signing iframe failed to load")),
        10000
      );
    });

    return Promise.race([this.readyPromise, timeout]);
  }

  /**
   * Send a request to the signing iframe and wait for response
   */
  private async sendRequest(request: SigningRequest): Promise<SigningResponse> {
    if (!this.iframe?.contentWindow) {
      throw new Error("Signing iframe not available");
    }

    if (!this.isReady) {
      await this.waitReady();
    }

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingRequests.delete(request.requestId);
        reject(new Error("Signing request timed out"));
      }, 10000);

      this.pendingRequests.set(request.requestId, { resolve, reject, timeout });

      this.iframe!.contentWindow!.postMessage(request, SIGNING_IFRAME_URL);
    });
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Initialize a new session - generates key pair
   * Returns the public key for server registration
   */
  public async initialize(): Promise<JsonWebKey> {
    console.log("[SigningClient] Initializing new session...");

    const response = await this.sendRequest({
      type: "INIT",
      requestId: this.generateRequestId(),
    });

    if (!response.success) {
      throw new Error(response.error || "Failed to initialize signing context");
    }

    if (!response.publicKey) {
      throw new Error("No public key returned from signing context");
    }

    console.log("[SigningClient] Session initialized, public key received");
    return response.publicKey;
  }

  /**
   * Get the current public key (if initialized)
   */
  public async getPublicKey(): Promise<JsonWebKey> {
    const response = await this.sendRequest({
      type: "GET_PUBLIC_KEY",
      requestId: this.generateRequestId(),
    });

    if (!response.success) {
      throw new Error(response.error || "Failed to get public key");
    }

    return response.publicKey!;
  }

  /**
   * Sign an action with the stored private key
   */
  public async sign(
    action: Action,
    proof: InteractionProof,
    nonce: string
  ): Promise<string> {
    console.log(
      "[SigningClient] Requesting signature for:",
      action.displayName
    );

    const response = await this.sendRequest({
      type: "SIGN",
      requestId: this.generateRequestId(),
      action,
      proof,
      nonce,
    });

    if (!response.success) {
      throw new Error(response.error || "Signing failed");
    }

    if (!response.signature) {
      throw new Error("No signature returned");
    }

    console.log("[SigningClient] Signature received");
    return response.signature;
  }
}

// Global instance
export const signingClient = new SigningClient();
