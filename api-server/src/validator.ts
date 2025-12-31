/**
 * Interaction Proof Validator (Server-side)
 * Validates interaction proofs for freshness and authenticity
 */

import type { InteractionProof, Action } from "./types";

const MAX_PROOF_AGE_MS = 5000; // 5 seconds
const MIN_TRAJECTORY_POINTS = 3;
const MAX_VELOCITY = 10; // pixels per millisecond

/**
 * Validate an interaction proof
 */
export function validateInteractionProof(
  proof: InteractionProof,
  action: Action
): { valid: boolean; error?: string } {
  // Check proof freshness
  const age = Date.now() - proof.freshness;
  if (age > MAX_PROOF_AGE_MS) {
    return { valid: false, error: "Interaction proof expired" };
  }

  if (age < -5000) {
    // Allow 5 seconds clock skew
    return { valid: false, error: "Interaction proof from the future" };
  }

  // Check that action context matches
  if (proof.actionContext !== action.displayName) {
    return {
      valid: false,
      error: `Action context mismatch: expected "${action.displayName}", got "${proof.actionContext}"`,
    };
  }

  // Validate trajectory exists
  if (!proof.trajectory || proof.trajectory.length < MIN_TRAJECTORY_POINTS) {
    return { valid: false, error: "Insufficient trajectory data" };
  }

  // Check for teleporting (unrealistic velocity)
  if (proof.velocity > MAX_VELOCITY) {
    return { valid: false, error: "Unrealistic mouse velocity detected" };
  }

  // Check interaction type is valid
  if (!["click", "submit", "keypress"].includes(proof.type)) {
    return { valid: false, error: "Invalid interaction type" };
  }

  // Validate trajectory timing
  if (!validateTrajectoryTiming(proof.trajectory)) {
    return { valid: false, error: "Invalid trajectory timing" };
  }

  return { valid: true };
}

/**
 * Validate trajectory timing
 */
function validateTrajectoryTiming(
  trajectory: { timestamp: number }[]
): boolean {
  if (trajectory.length < 2) return true;

  for (let i = 1; i < trajectory.length; i++) {
    const timeDiff = trajectory[i].timestamp - trajectory[i - 1].timestamp;

    // Time should be moving forward
    if (timeDiff < 0) return false;

    // Individual gaps shouldn't be too large
    if (timeDiff > 2000) return false;
  }

  return true;
}
