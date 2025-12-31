/**
 * Interaction Proof Validator
 * Validates that interaction proofs are genuine, recent, and match the action
 */

import type { InteractionProof, Action } from "./types";

// Maximum age of an interaction proof in milliseconds
const MAX_PROOF_AGE_MS = 5000; // 5 seconds

// Minimum trajectory points for a valid human interaction
const MIN_TRAJECTORY_POINTS = 3;

// Maximum allowed velocity (pixels per millisecond) - catches teleporting
const MAX_VELOCITY = 10;

/**
 * Validate an interaction proof
 */
export function validateProof(
  proof: InteractionProof,
  action: Action
): { valid: boolean; error?: string } {
  // Check proof freshness
  const age = Date.now() - proof.freshness;
  if (age > MAX_PROOF_AGE_MS) {
    return { valid: false, error: "Interaction proof expired" };
  }

  if (age < 0) {
    return { valid: false, error: "Interaction proof from the future" };
  }

  // Check that action context matches
  if (proof.actionContext !== action.displayName) {
    return {
      valid: false,
      error: `Action context mismatch: proof="${proof.actionContext}" action="${action.displayName}"`,
    };
  }

  // Validate trajectory exists and has enough points
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

  // Check position is within reasonable bounds
  if (proof.position.x < 0 || proof.position.y < 0) {
    return { valid: false, error: "Invalid position coordinates" };
  }

  // Validate trajectory timing makes sense
  if (!validateTrajectoryTiming(proof.trajectory)) {
    return { valid: false, error: "Invalid trajectory timing" };
  }

  // Check nonce is present
  if (!proof.nonce || proof.nonce.length < 16) {
    return { valid: false, error: "Missing or invalid nonce" };
  }

  return { valid: true };
}

/**
 * Validate trajectory timing - checks that timestamps are sequential
 * and time differences are realistic
 */
function validateTrajectoryTiming(
  trajectory: { timestamp: number }[]
): boolean {
  if (trajectory.length < 2) return true;

  for (let i = 1; i < trajectory.length; i++) {
    const timeDiff = trajectory[i].timestamp - trajectory[i - 1].timestamp;

    // Time should be moving forward
    if (timeDiff < 0) return false;

    // Individual gaps shouldn't be too large (> 1 second)
    if (timeDiff > 1000) return false;
  }

  return true;
}

/**
 * Calculate if the trajectory shows human-like movement patterns
 * This is a simplified version - production would use more sophisticated analysis
 */
export function analyzeTrajectoryHumanness(
  trajectory: { x: number; y: number; timestamp: number }[]
): number {
  if (trajectory.length < 3) return 0;

  let score = 0;

  // Check for variation in movement (not perfectly straight lines)
  let directionChanges = 0;
  for (let i = 2; i < trajectory.length; i++) {
    const dx1 = trajectory[i - 1].x - trajectory[i - 2].x;
    const dy1 = trajectory[i - 1].y - trajectory[i - 2].y;
    const dx2 = trajectory[i].x - trajectory[i - 1].x;
    const dy2 = trajectory[i].y - trajectory[i - 1].y;

    // Check for direction change
    if (
      Math.sign(dx1) !== Math.sign(dx2) ||
      Math.sign(dy1) !== Math.sign(dy2)
    ) {
      directionChanges++;
    }
  }

  // Some direction changes are expected in human movement
  if (directionChanges > 0) score += 25;
  if (directionChanges > 2) score += 25;

  // Check for acceleration/deceleration
  const speeds: number[] = [];
  for (let i = 1; i < trajectory.length; i++) {
    const dx = trajectory[i].x - trajectory[i - 1].x;
    const dy = trajectory[i].y - trajectory[i - 1].y;
    const dt = trajectory[i].timestamp - trajectory[i - 1].timestamp;
    if (dt > 0) {
      speeds.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }
  }

  if (speeds.length > 1) {
    const speedVariance = calculateVariance(speeds);
    if (speedVariance > 0.1) score += 25; // Some speed variation expected
  }

  // Check for enough data points
  if (trajectory.length >= 5) score += 25;

  return Math.min(score, 100);
}

/**
 * Calculate variance of an array of numbers
 */
function calculateVariance(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}
