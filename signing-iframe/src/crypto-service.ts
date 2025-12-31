/**
 * WebCrypto Service - ECDSA Key Generation and Signing
 * Uses non-extractable keys for security
 */

const ALGORITHM = {
  name: "ECDSA",
  namedCurve: "P-256",
};

const SIGN_ALGORITHM = {
  name: "ECDSA",
  hash: "SHA-256",
};

/**
 * Generate a new ECDSA P-256 key pair
 * Private key is non-extractable (critical for security)
 */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    ALGORITHM,
    false, // Non-extractable - CRITICAL FOR SECURITY
    ["sign", "verify"]
  );

  return keyPair;
}

/**
 * Export public key as JWK format for server registration
 */
export async function exportPublicKey(
  publicKey: CryptoKey
): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey("jwk", publicKey);
}

/**
 * Sign data with the private key
 */
export async function signData(
  privateKey: CryptoKey,
  data: ArrayBuffer
): Promise<ArrayBuffer> {
  return await crypto.subtle.sign(SIGN_ALGORITHM, privateKey, data);
}

/**
 * Create canonical message for signing
 * Format: action|proof|nonce
 */
export function createCanonicalMessage(
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
 * Convert ArrayBuffer to Base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
