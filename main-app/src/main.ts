/**
 * PAN Demo Application - Main Entry Point
 */

import { signingClient } from "./lib/signing-client";
import { sessionManager } from "./lib/session-manager";
import { performSecureAction } from "./lib/api-client";
import "./lib/interaction-tracker"; // Initialize tracking

interface DemoState {
  isLoggedIn: boolean;
  user: { id: string; email: string; name: string } | null;
  logs: string[];
}

const state: DemoState = {
  isLoggedIn: false,
  user: null,
  logs: [],
};

/**
 * Log a message to the demo console
 */
function log(message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  state.logs.push(`[${timestamp}] ${message}`);
  updateLogDisplay();
}

/**
 * Update the log display - using safe DOM manipulation (no innerHTML)
 */
function updateLogDisplay(): void {
  const logContainer = document.getElementById("log-output");
  if (logContainer) {
    // Clear existing content safely
    logContainer.replaceChildren();

    // Add log entries using safe DOM methods
    state.logs.slice(-20).forEach((logEntry) => {
      const div = document.createElement("div");
      div.className = "log-entry";
      div.textContent = logEntry; // Safe: textContent doesn't interpret HTML
      logContainer.appendChild(div);
    });

    logContainer.scrollTop = logContainer.scrollHeight;
  }
}

/**
 * Update UI based on login state
 */
function updateUI(): void {
  const loginSection = document.getElementById("login-section");
  const appSection = document.getElementById("app-section");
  const userDisplay = document.getElementById("user-display");

  if (state.isLoggedIn) {
    loginSection?.classList.add("hidden");
    appSection?.classList.remove("hidden");
    if (userDisplay && state.user) {
      userDisplay.textContent = `Logged in as: ${state.user.name} (${state.user.email})`;
    }
  } else {
    loginSection?.classList.remove("hidden");
    appSection?.classList.add("hidden");
    if (userDisplay) {
      userDisplay.textContent = "";
    }
  }
}

/**
 * Handle login form submission
 */
async function handleLogin(event: Event): Promise<void> {
  event.preventDefault();

  const form = event.target as HTMLFormElement;
  const username = (form.querySelector("#username") as HTMLInputElement).value;
  const password = (form.querySelector("#password") as HTMLInputElement).value;

  const loginBtn = form.querySelector(
    'button[type="submit"]'
  ) as HTMLButtonElement;
  loginBtn.disabled = true;
  loginBtn.textContent = "Initializing Secure Session...";

  try {
    log("Waiting for signing iframe to be ready...");
    await signingClient.waitReady();

    log("Generating non-extractable key pair...");
    const publicKey = await signingClient.initialize();
    log("Key pair generated! Public key ready for registration.");

    log("Sending login request with public key...");
    const response = await sessionManager.login(username, password, publicKey);

    if (response.success) {
      state.isLoggedIn = true;
      state.user = response.user || null;
      log(
        `Login successful! Session ID: ${response.sessionId?.substring(
          0,
          8
        )}...`
      );
      updateUI();
    } else {
      log(`Login failed: ${response.error}`);
    }
  } catch (error) {
    log(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Login & Generate Keys";
  }
}

/**
 * Handle logout
 */
async function handleLogout(): Promise<void> {
  log("Logging out...");
  await sessionManager.logout();
  state.isLoggedIn = false;
  state.user = null;
  log("Logged out successfully");
  updateUI();
}

/**
 * Perform a protected action (requires signature)
 */
async function handleProtectedAction(
  actionName: string,
  payload: unknown
): Promise<void> {
  try {
    log(`Initiating protected action: ${actionName}`);
    log("Getting interaction proof and signature...");

    const result = await performSecureAction<{
      success: boolean;
      message: string;
    }>("/api/protected/action", actionName, payload);

    log(`Action successful: ${result.message}`);
  } catch (error) {
    log(
      `Action failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Initialize the demo app
 */
function init(): void {
  log("PAN Demo Application initialized");
  log("Interaction tracking active - mouse movements are being recorded");

  // Set up login form handler
  const loginForm = document.getElementById("login-form");
  loginForm?.addEventListener("submit", handleLogin);

  // Set up logout button
  const logoutBtn = document.getElementById("logout-btn");
  logoutBtn?.addEventListener("click", handleLogout);

  // Set up protected action buttons
  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const actionName = btn.getAttribute("data-action") || "Unknown Action";
      const payload = btn.getAttribute("data-payload");
      handleProtectedAction(
        actionName,
        payload ? JSON.parse(payload) : { action: actionName }
      );
    });
  });

  updateUI();
}

// Start the app
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
