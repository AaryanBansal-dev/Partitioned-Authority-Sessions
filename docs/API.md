# API Reference

Complete API documentation for the Partitioned Authority Sessions (PAN) system.

---

## Table of Contents

1. [Authentication Endpoints](#authentication-endpoints)
2. [Session Management](#session-management)
3. [Nonce Generation](#nonce-generation)
4. [Protected Resources](#protected-resources)
5. [Client Libraries](#client-libraries)
6. [Error Codes](#error-codes)

---

## Authentication Endpoints

### POST `/api/auth/login`

Authenticate user and establish a new PAN session.

**Request:**
```http
POST /api/auth/login HTTP/1.1
Host: api.example.com
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "SecurePassword123!",
  "mfa_code": "123456",
  "public_key": {
    "kty": "EC",
    "crv": "P-256",
    "x": "base64_encoded_x_coordinate",
    "y": "base64_encoded_y_coordinate"
  }
}
```

**Response (Success):**
```http
HTTP/1.1 200 OK
Set-Cookie: session_id=abc123; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
Content-Type: application/json

{
  "success": true,
  "session_id": "abc123",
  "user": {
    "id": "user-456",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "expires_at": 1640086400
}
```

**Response (Failure):**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "success": false,
  "error": "invalid_credentials",
  "message": "Username or password is incorrect"
}
```

**Public Key Format:**
- Algorithm: ECDSA
- Curve: P-256 (secp256r1)
- Format: JSON Web Key (JWK)
- Required fields: `kty`, `crv`, `x`, `y`

---

### POST `/api/auth/logout`

Terminate the current session and invalidate the session token.

**Request:**
```http
POST /api/auth/logout HTTP/1.1
Host: api.example.com
Cookie: session_id=abc123
X-Session-ID: abc123
X-Signature: base64_encoded_ecdsa_signature
X-Interaction-Proof: {...}
```

**Response:**
```http
HTTP/1.1 200 OK
Set-Cookie: session_id=; Max-Age=0
Content-Type: application/json

{
  "success": true,
  "message": "Session terminated successfully"
}
```

---

## Session Management

### GET `/api/session/info`

Retrieve information about the current session.

**Request:**
```http
GET /api/session/info HTTP/1.1
Host: api.example.com
Cookie: session_id=abc123
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "session_id": "abc123",
  "user_id": "user-456",
  "created_at": 1640000000,
  "last_access": 1640001000,
  "expires_at": 1640086400,
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "device_id": "device-789"
}
```

---

### GET `/api/session/list`

List all active sessions for the authenticated user.

**Request:**
```http
GET /api/session/list HTTP/1.1
Host: api.example.com
Cookie: session_id=abc123
X-Session-ID: abc123
X-Signature: base64_encoded_signature
X-Interaction-Proof: {...}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "sessions": [
    {
      "session_id": "abc123",
      "created_at": 1640000000,
      "last_access": 1640001000,
      "ip_address": "192.168.1.1",
      "device": "Chrome on Windows",
      "current": true
    },
    {
      "session_id": "def456",
      "created_at": 1639900000,
      "last_access": 1639999000,
      "ip_address": "192.168.1.100",
      "device": "Safari on iPhone",
      "current": false
    }
  ]
}
```

---

### DELETE `/api/session/:session_id`

Revoke a specific session.

**Request:**
```http
DELETE /api/session/def456 HTTP/1.1
Host: api.example.com
Cookie: session_id=abc123
X-Session-ID: abc123
X-Signature: base64_encoded_signature
X-Interaction-Proof: {...}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "message": "Session def456 has been revoked"
}
```

---

## Nonce Generation

### GET `/api/nonce`

Generate a single-use nonce for signature creation.

**Request:**
```http
GET /api/nonce HTTP/1.1
Host: api.example.com
Cookie: session_id=abc123
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "nonce": "a1b2c3d4e5f6...",
  "expires_at": 1640000300
}
```

**Nonce Properties:**
- **Length**: 32 bytes (256 bits)
- **Encoding**: Base64
- **TTL**: 5 minutes (300 seconds)
- **Single-use**: Consumed atomically upon verification
- **Storage**: Redis with automatic expiration

**Usage:**
```typescript
// 1. Fetch nonce
const { nonce } = await fetch('/api/nonce').then(r => r.json());

// 2. Include in signature request to signing iframe
const signature = await requestSignature({
    action: myAction,
    proof: interactionProof,
    nonce: nonce
});

// 3. Send signed request (nonce is in interaction proof)
await fetch('/api/protected-resource', {
    headers: {
        'X-Signature': signature,
        'X-Interaction-Proof': JSON.stringify({ ...proof, nonce })
    }
});
```

---

## Protected Resources

All sensitive operations require:
1. Valid session cookie
2. ECDSA signature in `X-Signature` header
3. Interaction proof in `X-Interaction-Proof` header

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Session-ID` | Yes | Session identifier from cookie |
| `X-Signature` | Yes | Base64-encoded ECDSA signature |
| `X-Interaction-Proof` | Yes | JSON-encoded interaction proof |

### Interaction Proof Structure

```typescript
interface InteractionProof {
  // Interaction metadata
  type: 'click' | 'submit' | 'keypress';
  timestamp: number;           // Unix timestamp (ms)
  freshness: number;           // When proof was created
  
  // Element identification
  target: string;              // SHA-256 hash of target element
  actionContext: string;       // Human-readable action description
  actionHash: string;          // Hash of the action being performed
  
  // Behavioral analysis
  position: {
    x: number;
    y: number;
  };
  trajectory: Array<{
    x: number;
    y: number;
    timestamp: number;
  }>;
  velocity: number;            // Pixels per millisecond
  acceleration: number;        // Change in velocity
  
  // Security
  nonce: string;               // Single-use nonce from server
}
```

### Example Protected Request

```http
POST /api/transfer HTTP/1.1
Host: api.example.com
Cookie: session_id=abc123
Content-Type: application/json
X-Session-ID: abc123
X-Signature: MEUCIQDt3IE...
X-Interaction-Proof: {"type":"click","timestamp":1640000000,...}

{
  "to_account": "user-789",
  "amount": 500.00,
  "currency": "USD",
  "description": "Payment for services"
}
```

---

## Client Libraries

### TypeScript/JavaScript

#### Installation

```bash
npm install @pan/client
```

#### Usage

```typescript
import { PANClient } from '@pan/client';

// Initialize
const pan = new PANClient({
  mainOrigin: 'https://example.com',
  signingOrigin: 'https://sign.example.com',
  apiEndpoint: 'https://api.example.com'
});

// Login
await pan.login({
  username: 'user@example.com',
  password: 'password',
  mfaCode: '123456'
});

// Perform authenticated action
const result = await pan.execute({
  endpoint: '/api/transfer',
  method: 'POST',
  body: {
    to_account: 'user-789',
    amount: 500.00
  },
  actionDescription: 'Transfer $500 to Alice'
});
```

#### API Reference

##### `PANClient`

```typescript
class PANClient {
  constructor(options: PANClientOptions);
  
  // Authentication
  login(credentials: LoginCredentials): Promise<LoginResult>;
  logout(): Promise<void>;
  
  // Signature operations
  execute(request: SecureRequest): Promise<Response>;
  
  // Session management
  getSessionInfo(): Promise<SessionInfo>;
  listSessions(): Promise<Session[]>;
  revokeSession(sessionId: string): Promise<void>;
}

interface PANClientOptions {
  mainOrigin: string;
  signingOrigin: string;
  apiEndpoint: string;
  interactionTimeout?: number;  // Default: 5000ms
}

interface SecureRequest {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  actionDescription: string;    // Shown to user for verification
}
```

---

### Go

#### Installation

```bash
go get github.com/yourusername/pan-go
```

#### Server-Side Verification

```go
import (
    "github.com/yourusername/pan-go/verification"
)

func main() {
    // Initialize verifier
    verifier := verification.NewVerifier(&verification.Config{
        RedisAddr: "localhost:6379",
        RedisDB:   0,
    })
    
    // Add middleware to protected routes
    http.Handle("/api/transfer", verifier.Middleware(transferHandler))
}

func transferHandler(w http.ResponseWriter, r *http.Request) {
    // Request is already verified by middleware
    // Extract user info from context
    sessionInfo := r.Context().Value("session").(verification.SessionInfo)
    
    // Process transfer
    // ...
}
```

---

## Error Codes

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request succeeded |
| 400 | Bad Request | Malformed request or invalid parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Valid auth but action not allowed |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource conflict (e.g., duplicate nonce) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |

### Application Error Codes

```typescript
enum PANErrorCode {
  // Authentication errors (1xxx)
  INVALID_CREDENTIALS = 1001,
  MFA_REQUIRED = 1002,
  MFA_INVALID = 1003,
  SESSION_EXPIRED = 1004,
  SESSION_INVALID = 1005,
  
  // Signature errors (2xxx)
  SIGNATURE_MISSING = 2001,
  SIGNATURE_INVALID = 2002,
  PUBLIC_KEY_INVALID = 2003,
  SIGNATURE_VERIFICATION_FAILED = 2004,
  
  // Nonce errors (3xxx)
  NONCE_MISSING = 3001,
  NONCE_INVALID = 3002,
  NONCE_EXPIRED = 3003,
  NONCE_REUSED = 3004,
  
  // Interaction proof errors (4xxx)
  PROOF_MISSING = 4001,
  PROOF_INVALID = 4002,
  PROOF_EXPIRED = 4003,
  PROOF_CONTEXT_MISMATCH = 4004,
  PROOF_NON_HUMAN = 4005,
  
  // Rate limiting (5xxx)
  RATE_LIMIT_EXCEEDED = 5001,
  TOO_MANY_FAILED_ATTEMPTS = 5002,
  
  // System errors (9xxx)
  INTERNAL_ERROR = 9001,
  SERVICE_UNAVAILABLE = 9002
}
```

### Error Response Format

```json
{
  "success": false,
  "error": "signature_invalid",
  "code": 2002,
  "message": "The provided signature could not be verified",
  "details": {
    "session_id": "abc123",
    "timestamp": 1640000000
  }
}
```

---

## Rate Limiting

### Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` | 5 attempts | 15 minutes |
| `/api/nonce` | 60 requests | 1 minute |
| Protected resources | 100 requests | 1 minute |
| `/api/session/*` | 20 requests | 1 minute |

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000060
```

### Rate Limit Exceeded Response

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
Content-Type: application/json

{
  "success": false,
  "error": "rate_limit_exceeded",
  "code": 5001,
  "message": "Too many requests. Please try again in 60 seconds.",
  "retry_after": 60
}
```

---

## Webhook Events

Subscribe to session events for monitoring and alerting.

### Event Types

```typescript
enum SessionEvent {
  SESSION_CREATED = 'session.created',
  SESSION_EXPIRED = 'session.expired',
  SESSION_REVOKED = 'session.revoked',
  SIGNATURE_FAILED = 'signature.failed',
  ANOMALY_DETECTED = 'anomaly.detected',
  RATE_LIMIT_EXCEEDED = 'ratelimit.exceeded'
}
```

### Webhook Payload

```json
{
  "event": "signature.failed",
  "timestamp": 1640000000,
  "session_id": "abc123",
  "user_id": "user-456",
  "data": {
    "reason": "invalid_signature",
    "ip_address": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "endpoint": "/api/transfer"
  }
}
```

### Webhook Configuration

```http
POST /api/webhooks HTTP/1.1
Host: api.example.com
Content-Type: application/json

{
  "url": "https://your-server.com/webhook",
  "events": ["signature.failed", "anomaly.detected"],
  "secret": "your_webhook_secret"
}
```

---

## Testing & Development

### Test Mode

Enable test mode for development:

```typescript
const pan = new PANClient({
  mainOrigin: 'http://localhost:3000',
  signingOrigin: 'http://localhost:3001',
  apiEndpoint: 'http://localhost:8080',
  testMode: true  // Disables some security checks
});
```

**Warning:** Never use test mode in production!

### Mock Server

```bash
# Start mock PAN server for testing
npm install -g @pan/mock-server
pan-mock-server --port 8080
```

---

## OpenAPI Specification

Full OpenAPI 3.0 specification available at:

```
https://api.example.com/openapi.json
```

Interactive API documentation:

```
https://api.example.com/docs
```

---

## Support & Resources

- **GitHub**: [github.com/yourusername/pan](https://github.com/yourusername/pan)
- **Documentation**: [docs.example.com](https://docs.example.com)
- **API Status**: [status.example.com](https://status.example.com)
- **Support Email**: api-support@example.com
