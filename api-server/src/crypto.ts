/**
 * ECDSA Signature Verification
 * Verifies signatures from the signing iframe
 */

import type { InteractionProof, Action } from "./types";

/**
 * Import a public key from JWK format
 */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["verify"]
  );
}

/**
 * Verify an ECDSA signature
 */
export async function verifySignature(
  publicKeyJwk: string,
  signatureBase64: string,
  action: unknown,
  proof: InteractionProof,
  nonce: string
): Promise<boolean> {
  try {
    // Parse the public key JWK
    const jwk: JsonWebKey = JSON.parse(publicKeyJwk);
    const publicKey = await importPublicKey(jwk);

    // Decode the signature
    const signatureBytes = base64ToArrayBuffer(signatureBase64);

    // Create the canonical message (must match client-side)
    const message = createCanonicalMessage(action, proof, nonce);
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    // Verify the signature
    const valid = await crypto.subtle.verify(
      {
        name: "ECDSA",
        hash: "SHA-256",
      },
      publicKey,
      signatureBytes,
      data
    );

    return valid;
  } catch (error) {
    console.error("[Crypto] Signature verification error:", error);
    return false;
  }
}

/**
 * Create canonical message for verification
 * Format: action|proof|nonce
 * Must match the client-side implementation exactly
 */
function createCanonicalMessage(
  action: unknown,
  proof: unknown,
  nonce: string
): string {
  const canonicalAction = JSON.stringify(
    action,
    Object.keys(action as object).sort()
  );
  const canonicalProof = JSON.stringify(
    proof,
    Object.keys(proof as object).sort()
  );

  return `${canonicalAction}|${canonicalProof}|${nonce}`;
}

/**
 * Convert Base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
