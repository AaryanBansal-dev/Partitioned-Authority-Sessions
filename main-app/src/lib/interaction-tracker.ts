/**
 * Interaction Tracker - Captures mouse movements, clicks, and timing data
 * Creates cryptographic proofs of genuine user interactions
 */

import type { InteractionProof, TrajectoryPoint, Action } from "./types";

interface RecordedInteraction {
  type: "click" | "submit" | "keypress";
  timestamp: number;
  target: string;
  position: { x: number; y: number };
  trajectory: TrajectoryPoint[];
  actionContext: string;
  velocity: number;
  acceleration: number;
}

const MAX_TRAJECTORY_POINTS = 100;
const MAX_INTERACTIONS = 20;

export class InteractionTracker {
  private trajectoryPoints: TrajectoryPoint[] = [];
  private interactions: RecordedInteraction[] = [];
  private lastVelocity = 0;

  constructor() {
    this.setupListeners();
  }

  /**
   * Set up event listeners for tracking user interactions
   */
  private setupListeners(): void {
    // Track mouse movement for trajectory analysis
    document.addEventListener("mousemove", (e) => {
      this.trajectoryPoints.push({
        x: e.clientX,
        y: e.clientY,
        timestamp: performance.now(),
      });

      // Keep only last N points to avoid memory issues
      if (this.trajectoryPoints.length > MAX_TRAJECTORY_POINTS) {
        this.trajectoryPoints.shift();
      }
    });

    // Capture clicks with full context
    document.addEventListener(
      "click",
      (e) => {
        this.recordInteraction({
          type: "click",
          timestamp: Date.now(),
          target: this.hashElement(e.target as HTMLElement),
          position: { x: e.clientX, y: e.clientY },
          trajectory: [...this.trajectoryPoints],
          actionContext: this.getActionContext(e.target as HTMLElement),
          velocity: this.calculateVelocity(),
          acceleration: this.calculateAcceleration(),
        });
      },
      { capture: true }
    );

    // Capture form submissions
    document.addEventListener(
      "submit",
      (e) => {
        const target = e.target as HTMLFormElement;
        this.recordInteraction({
          type: "submit",
          timestamp: Date.now(),
          target: this.hashElement(target),
          position: { x: 0, y: 0 }, // Forms don't have click position
          trajectory: [...this.trajectoryPoints],
          actionContext: this.getFormContext(target),
          velocity: this.calculateVelocity(),
          acceleration: this.calculateAcceleration(),
        });
      },
      { capture: true }
    );

    // Capture key presses for keyboard-triggered actions
    document.addEventListener(
      "keypress",
      (e) => {
        if (e.key === "Enter") {
          this.recordInteraction({
            type: "keypress",
            timestamp: Date.now(),
            target: this.hashElement(e.target as HTMLElement),
            position: { x: 0, y: 0 },
            trajectory: [...this.trajectoryPoints],
            actionContext: this.getActionContext(e.target as HTMLElement),
            velocity: this.calculateVelocity(),
            acceleration: this.calculateAcceleration(),
          });
        }
      },
      { capture: true }
    );
  }

  /**
   * Record an interaction
   */
  private recordInteraction(interaction: RecordedInteraction): void {
    this.interactions.push(interaction);

    // Keep only recent interactions
    if (this.interactions.length > MAX_INTERACTIONS) {
      this.interactions.shift();
    }
  }

  /**
   * Get an interaction proof for a specific action
   */
  public getInteractionProof(
    action: Action,
    nonce: string
  ): InteractionProof | null {
    // Find a matching recent interaction
    const recent = this.findMatchingInteraction(action);
    if (!recent) {
      console.warn(
        "[InteractionTracker] No matching interaction found for action:",
        action.displayName
      );
      return null;
    }

    return {
      type: recent.type,
      timestamp: recent.timestamp,
      freshness: Date.now(),
      target: recent.target,
      actionContext: recent.actionContext,
      actionHash: this.hashAction(action),
      position: recent.position,
      trajectory: recent.trajectory,
      velocity: recent.velocity,
      acceleration: recent.acceleration,
      nonce,
    };
  }

  /**
   * Find a matching interaction for the given action
   */
  private findMatchingInteraction(action: Action): RecordedInteraction | null {
    const now = Date.now();
    const maxAge = 5000; // 5 seconds

    // Find the most recent interaction that matches the action context
    for (let i = this.interactions.length - 1; i >= 0; i--) {
      const interaction = this.interactions[i];

      // Check age
      if (now - interaction.timestamp > maxAge) {
        continue;
      }

      // Check context match
      if (interaction.actionContext === action.displayName) {
        // Remove this interaction so it can't be reused
        this.interactions.splice(i, 1);
        return interaction;
      }
    }

    return null;
  }

  /**
   * Hash an HTML element for identification
   */
  private hashElement(element: HTMLElement): string {
    const descriptor = [
      element.tagName,
      element.id,
      element.className,
      element.getAttribute("data-action"),
      element.textContent?.substring(0, 50),
    ].join("|");

    return this.simpleHash(descriptor);
  }

  /**
   * Get a human-readable action context from an element
   */
  private getActionContext(element: HTMLElement): string {
    // Check for explicit action label
    const dataAction = element.getAttribute("data-action");
    if (dataAction) {
      return dataAction;
    }

    // Check for button text
    if (
      element.tagName === "BUTTON" ||
      element.getAttribute("role") === "button"
    ) {
      return element.textContent?.trim() || "Unknown Button";
    }

    // Check for link text
    if (element.tagName === "A") {
      return element.textContent?.trim() || "Unknown Link";
    }

    // Check for input submit
    if (
      element.tagName === "INPUT" &&
      (element as HTMLInputElement).type === "submit"
    ) {
      return (element as HTMLInputElement).value || "Submit";
    }

    // Traverse up to find clickable parent
    let parent = element.parentElement;
    while (parent) {
      if (
        parent.tagName === "BUTTON" ||
        parent.getAttribute("role") === "button"
      ) {
        return parent.textContent?.trim() || "Unknown Button";
      }
      parent = parent.parentElement;
    }

    return "Unknown Action";
  }

  /**
   * Get context from a form element
   */
  private getFormContext(form: HTMLFormElement): string {
    const submitButton = form.querySelector(
      'button[type="submit"], input[type="submit"]'
    );
    if (submitButton) {
      return (
        submitButton.textContent?.trim() ||
        (submitButton as HTMLInputElement).value ||
        "Submit Form"
      );
    }
    return form.getAttribute("data-action") || "Submit Form";
  }

  /**
   * Calculate current mouse velocity (pixels per millisecond)
   */
  private calculateVelocity(): number {
    if (this.trajectoryPoints.length < 2) return 0;

    const recent = this.trajectoryPoints.slice(-5);
    if (recent.length < 2) return 0;

    let totalDistance = 0;
    let totalTime = 0;

    for (let i = 1; i < recent.length; i++) {
      const dx = recent[i].x - recent[i - 1].x;
      const dy = recent[i].y - recent[i - 1].y;
      const dt = recent[i].timestamp - recent[i - 1].timestamp;

      totalDistance += Math.sqrt(dx * dx + dy * dy);
      totalTime += dt;
    }

    const velocity = totalTime > 0 ? totalDistance / totalTime : 0;
    this.lastVelocity = velocity;
    return velocity;
  }

  /**
   * Calculate mouse acceleration
   */
  private calculateAcceleration(): number {
    const currentVelocity = this.calculateVelocity();
    const acceleration = currentVelocity - this.lastVelocity;
    return acceleration;
  }

  /**
   * Hash an action for inclusion in proof
   */
  private hashAction(action: Action): string {
    const canonical = JSON.stringify({
      type: action.type,
      context: action.context,
      displayName: action.displayName,
    });
    return this.simpleHash(canonical);
  }

  /**
   * Simple hash function (for non-cryptographic use)
   * In production, use crypto.subtle.digest for proper hashing
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }
}

// Global instance
export const interactionTracker = new InteractionTracker();
