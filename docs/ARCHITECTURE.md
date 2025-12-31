# PAN Architecture Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack Details](#technology-stack-details)
3. [Component Architecture](#component-architecture)
4. [Data Flow](#data-flow)
5. [Security Boundaries](#security-boundaries)
6. [Storage Architecture](#storage-architecture)

---

## System Overview

Partitioned Authority Sessions (PAN) is built on a multi-layer architecture that separates concerns and creates security boundaries through browser isolation mechanisms and cryptographic verification.

### Key Architectural Principles

1. **Separation of Concerns**: Session identification, signature generation, and verification are isolated
2. **Defense in Depth**: Multiple layers of security (origin isolation, cryptography, behavioral analysis)
3. **Zero Trust**: Every request is independently verified regardless of session state
4. **Stateless Verification**: Server can verify without storing sensitive session state

---

## Technology Stack Details

### Layer 1: Main Application (`example.com`)

**Technology**: TypeScript with modern web standards

**Responsibilities**:
- User interface rendering
- Session cookie management (identifier only)
- User interaction tracking and analysis
- Request orchestration
- Communication with signing iframe via postMessage

**Key Dependencies**:
```json
{
  "dependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

**Build Configuration**:
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node"
  }
}
```

### Layer 2: Signing Iframe (`sign.example.com`)

**Technology**: Vanilla TypeScript (no framework dependencies)

**Why No Framework?**:
- Minimal attack surface
- Reduced bundle size for faster loading
- No third-party dependencies to audit
- Direct browser API access
- Complete control over execution environment

**Responsibilities**:
- ECDSA key pair generation (P-256 curve)
- Private key storage in origin-isolated IndexedDB
- Signature generation for validated requests
- Interaction proof validation
- Cross-origin message handling

**Browser APIs Used**:
- `crypto.subtle` (Web Cryptography API)
- `IndexedDB` (origin-isolated storage)
- `postMessage` (cross-origin communication)
- `window.addEventListener` (message handling)

**Security Constraints**:
```typescript
// Key generation with non-extractable flag
const keyPair = await crypto.subtle.generateKey(
    {
        name: 'ECDSA',
        namedCurve: 'P-256'
    },
    false,  // ← Non-extractable (CRITICAL)
    ['sign']
);
```

### Layer 3: API & Verification Server

**Technology**: Go (Golang) 1.21+

**Why Go?**:
- Excellent performance for cryptographic operations
- Strong standard library (`crypto/*` packages)
- Native concurrency (goroutines) for handling many concurrent sessions
- Memory safety (prevents common vulnerabilities)
- Fast startup time and low memory footprint
- Excellent Redis client libraries

**Crypto Packages Used**:
```go
import (
    "crypto/ecdsa"      // ECDSA signature verification
    "crypto/elliptic"   // P-256 curve operations
    "crypto/sha256"     // Hashing for signature
    "crypto/x509"       // Public key parsing
    "encoding/pem"      // Key format handling
)
```

**Responsibilities**:
- HTTP/HTTPS request handling
- ECDSA signature verification
- Interaction proof validation
- Nonce management (generation & validation)
- Session lifecycle management
- Rate limiting
- Anomaly detection

**Performance Characteristics**:
- Signature verification: ~1ms (P-256 ECDSA)
- Redis lookup: ~0.3ms (with connection pooling)
- JSON parsing: ~0.1ms
- Total overhead: ~1.5ms per request

### Layer 4: Cryptography

**Client-Side**: Browser WebCrypto API

**Supported Algorithms**:
```javascript
{
  name: 'ECDSA',
  namedCurve: 'P-256',  // Also known as secp256r1 or prime256v1
  hash: 'SHA-256'
}
```

**Key Properties**:
- **Key Size**: 256-bit (32 bytes)
- **Signature Size**: 64 bytes (two 32-byte integers: R and S)
- **Security Level**: 128-bit security (equivalent to AES-128)
- **Performance**: Fast on modern hardware
- **Browser Support**: Universal (Chrome, Firefox, Safari, Edge)

**Server-Side**: Go `crypto/*` standard library

**Verification Process**:
```go
func VerifySignature(publicKey *ecdsa.PublicKey, hash []byte, signature []byte) bool {
    r := new(big.Int).SetBytes(signature[:32])
    s := new(big.Int).SetBytes(signature[32:])
    
    return ecdsa.Verify(publicKey, hash, r, s)
}
```

### Layer 5: Storage (Redis)

**Technology**: Redis 7.0+ (in-memory data store)

**Why Redis?**:
- **Speed**: Sub-millisecond operations
- **Atomic Operations**: GETDEL for nonce validation prevents race conditions
- **TTL Support**: Automatic expiration for sessions and nonces
- **Data Structures**: Hashes for sessions, Sets for rate limiting
- **Persistence**: AOF (Append-Only File) for durability
- **Clustering**: Multi-datacenter support
- **Pub/Sub**: Real-time session invalidation across servers

**Data Structures Used**:

1. **Sessions** (Hash):
```redis
HSET session:abc123 
  user_id "user-456"
  public_key "{\"kty\":\"EC\",\"crv\":\"P-256\",...}"
  created_at 1640000000
  last_access 1640001000
  ip_address "192.168.1.1"
  user_agent "Mozilla/5.0..."

EXPIRE session:abc123 86400
```

2. **Nonces** (String with TTL):
```redis
SET nonce:xyz789 "1" EX 300
GETDEL nonce:xyz789  # Atomic get-and-delete
```

3. **Rate Limiting** (Sorted Set):
```redis
ZADD ratelimit:session:abc123 1640000000 "request-1"
ZADD ratelimit:session:abc123 1640000001 "request-2"
ZREMRANGEBYSCORE ratelimit:session:abc123 0 1639999940  # Remove old entries
ZCARD ratelimit:session:abc123  # Count requests in window
```

4. **Public Key Registry** (Hash):
```redis
HSET pubkeys:user-456 
  session:abc123 "{\"kty\":\"EC\",...}"
  session:def456 "{\"kty\":\"EC\",...}"
```

**Configuration**:
```conf
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec

# Persistence
save 900 1      # Save if 1 key changed in 15 minutes
save 300 10     # Save if 10 keys changed in 5 minutes
save 60 10000   # Save if 10000 keys changed in 1 minute
```

---

## Component Architecture

### Frontend Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  MAIN APPLICATION                       │
│                    (example.com)                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │  UI Layer        │  │  Interaction Tracker     │   │
│  │  • Components    │  │  • Mouse trajectory      │   │
│  │  • Routes        │  │  • Timing analysis       │   │
│  │  • State mgmt    │  │  • Context binding       │   │
│  └──────────────────┘  └──────────────────────────┘   │
│           │                      │                      │
│           └──────────┬───────────┘                      │
│                      ▼                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Signing Service Client                   │  │
│  │  • postMessage wrapper                           │  │
│  │  • Request/response handling                     │  │
│  │  • Timeout management                            │  │
│  └──────────────────────────────────────────────────┘  │
│                      │                                  │
└──────────────────────┼──────────────────────────────────┘
                       │ postMessage
                       ▼
┌─────────────────────────────────────────────────────────┐
│              SIGNING IFRAME                             │
│             (sign.example.com)                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Message Handler                          │  │
│  │  • Origin validation                             │  │
│  │  • Request parsing                               │  │
│  │  • Response formatting                           │  │
│  └──────────────────────────────────────────────────┘  │
│                      │                                  │
│  ┌──────────────────▼──────────────────────────────┐  │
│  │      Interaction Proof Validator                │  │
│  │  • Freshness check (< 5 sec)                    │  │
│  │  • Context matching                             │  │
│  │  • Trajectory analysis                          │  │
│  └──────────────────────────────────────────────────┘  │
│                      │                                  │
│  ┌──────────────────▼──────────────────────────────┐  │
│  │         Crypto Service                          │  │
│  │  • Key generation (login)                       │  │
│  │  • Key storage (IndexedDB)                      │  │
│  │  • Signature generation                         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Backend Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   API SERVER (Go)                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │          HTTP Router (Gorilla Mux)               │  │
│  │  • Route matching                                │  │
│  │  • Middleware chain                              │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐  │
│  │      Verification Middleware                     │  │
│  │  • Header extraction                             │  │
│  │  • Signature verification                        │  │
│  │  • Interaction validation                        │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐  │
│  │         Session Manager                          │  │
│  │  • Session lookup (Redis)                        │  │
│  │  • Public key retrieval                          │  │
│  │  • Session lifecycle                             │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐  │
│  │       Nonce Manager                              │  │
│  │  • Nonce generation                              │  │
│  │  • Nonce validation (atomic)                     │  │
│  │  • TTL enforcement                               │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐  │
│  │     Anomaly Detector                             │  │
│  │  • Behavioral analysis                           │  │
│  │  • Rate limiting                                 │  │
│  │  • Pattern matching                              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
          ┌───────────────────────┐
          │    Redis Cluster      │
          │  • Session store      │
          │  • Nonce registry     │
          │  • Rate limit data    │
          └───────────────────────┘
```

---

## Data Flow

### 1. Session Initialization (Login)

```
┌────────┐                ┌────────────┐              ┌──────────┐           ┌───────┐
│ User   │                │  Main App  │              │  Signing │           │  API  │
│        │                │            │              │  Iframe  │           │Server │
└───┬────┘                └─────┬──────┘              └────┬─────┘           └───┬───┘
    │                           │                          │                     │
    │ 1. Enter credentials      │                          │                     │
    ├──────────────────────────►│                          │                     │
    │                           │                          │                     │
    │                           │ 2. Request key generation│                     │
    │                           ├─────────────────────────►│                     │
    │                           │                          │                     │
    │                           │                          │ 3. Generate ECDSA   │
    │                           │                          │    key pair         │
    │                           │                          │    (non-extractable)│
    │                           │                          │                     │
    │                           │  4. Return public key    │                     │
    │                           │◄─────────────────────────┤                     │
    │                           │                          │                     │
    │                           │ 5. Send credentials + pubkey                   │
    │                           ├────────────────────────────────────────────────►│
    │                           │                          │                     │
    │                           │                          │          6. Verify credentials
    │                           │                          │             & store pubkey
    │                           │                          │                     │
    │                           │  7. Return session cookie│                     │
    │                           │◄────────────────────────────────────────────────┤
    │                           │                          │                     │
    │ 8. Session established    │                          │                     │
    │◄──────────────────────────┤                          │                     │
```

### 2. Authenticated Request Flow

```
┌────────┐         ┌────────────┐         ┌──────────┐         ┌──────┐       ┌───────┐
│ User   │         │  Main App  │         │  Signing │         │Redis │       │  API  │
│        │         │            │         │  Iframe  │         │      │       │Server │
└───┬────┘         └─────┬──────┘         └────┬─────┘         └──┬───┘       └───┬───┘
    │                    │                     │                   │               │
    │ 1. Click button    │                     │                   │               │
    ├───────────────────►│                     │                   │               │
    │                    │                     │                   │               │
    │                    │ 2. Capture interaction                  │               │
    │                    │    (trajectory, timing, context)        │               │
    │                    │                     │                   │               │
    │                    │ 3. Request nonce    │                   │               │
    │                    ├─────────────────────────────────────────────────────────►│
    │                    │                     │                   │               │
    │                    │                     │                   │  4. Generate  │
    │                    │                     │                   │     nonce     │
    │                    │                     │                   │◄──────────────┤
    │                    │  5. Return nonce    │                   │               │
    │                    │◄─────────────────────────────────────────────────────────┤
    │                    │                     │                   │               │
    │                    │ 6. Request signature│                   │               │
    │                    │   (action + proof + nonce)              │               │
    │                    ├────────────────────►│                   │               │
    │                    │                     │                   │               │
    │                    │                     │ 7. Validate proof │               │
    │                    │                     │    • Freshness    │               │
    │                    │                     │    • Context      │               │
    │                    │                     │    • Trajectory   │               │
    │                    │                     │                   │               │
    │                    │                     │ 8. Sign request   │               │
    │                    │                     │   with private key│               │
    │                    │                     │                   │               │
    │                    │  9. Return signature│                   │               │
    │                    │◄────────────────────┤                   │               │
    │                    │                     │                   │               │
    │                    │ 10. Send signed request                 │               │
    │                    │   Headers:          │                   │               │
    │                    │   • X-Session-ID    │                   │               │
    │                    │   • X-Signature     │                   │               │
    │                    │   • X-Interaction-Proof                 │               │
    │                    ├─────────────────────────────────────────────────────────►│
    │                    │                     │                   │               │
    │                    │                     │                   │  11. Get      │
    │                    │                     │                   │   session &   │
    │                    │                     │                   │   public key  │
    │                    │                     │                   │◄──────────────┤
    │                    │                     │                   │               │
    │                    │                     │                   │  12. Verify   │
    │                    │                     │                   │   signature   │
    │                    │                     │                   │   (ECDSA)     │
    │                    │                     │                   │               │
    │                    │                     │                   │  13. Validate │
    │                    │                     │                   │   & consume   │
    │                    │                     │                   │   nonce       │
    │                    │                     │                   │◄──────────────┤
    │                    │                     │                   │               │
    │                    │                     │                   │  14. Check    │
    │                    │                     │                   │   interaction │
    │                    │                     │                   │   patterns    │
    │                    │                     │                   │               │
    │                    │  15. Response       │                   │               │
    │                    │◄─────────────────────────────────────────────────────────┤
    │ 16. Display result │                     │                   │               │
    │◄───────────────────┤                     │                   │               │
```

---

## Security Boundaries

### Origin Isolation

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser Security Model                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐    │
│  │  Origin: example.com   │  │Origin: sign.example.com│    │
│  ├────────────────────────┤  ├────────────────────────┤    │
│  │ JavaScript Scope       │  │ JavaScript Scope       │    │
│  │ • Can read DOM         │  │ • Can read OWN DOM     │    │
│  │ • Can access cookies   │  │ • Can access OWN cookies│   │
│  │ • Cannot read iframe   │  │ • Isolated from parent │    │
│  │   from sign.example.com│  │                        │    │
│  │                        │  │                        │    │
│  ├────────────────────────┤  ├────────────────────────┤    │
│  │ Storage (LocalStorage) │  │ Storage (IndexedDB)    │    │
│  │ • app-specific data    │  │ • private key (only!)  │    │
│  │                        │  │ • ISOLATED by browser  │    │
│  │                        │  │                        │    │
│  └────────────────────────┘  └────────────────────────┘    │
│            │                          ▲                     │
│            │                          │                     │
│            └──────────────────────────┘                     │
│                   postMessage ONLY                          │
│              (with origin validation)                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘

Defense: Same-Origin Policy prevents cross-origin access
Result: XSS on example.com CANNOT access sign.example.com resources
```

### WebCrypto Security

```
┌──────────────────────────────────────────────────────────┐
│             Browser WebCrypto Isolation                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  CryptoKey {                                             │
│    type: "private",                                      │
│    extractable: false,  ← CRITICAL: Cannot be exported  │
│    algorithm: {                                          │
│      name: "ECDSA",                                      │
│      namedCurve: "P-256"                                 │
│    },                                                    │
│    usages: ["sign"]                                      │
│  }                                                       │
│                                                          │
│  ✓  Allowed: crypto.subtle.sign(key, data)              │
│  ✗  Blocked: crypto.subtle.exportKey("raw", key)        │
│  ✗  Blocked: crypto.subtle.exportKey("jwk", key)        │
│  ✗  Blocked: Reading key material from memory           │
│                                                          │
└──────────────────────────────────────────────────────────┘

Defense: Browser enforces non-extractable flag at API level
Result: Even with arbitrary code execution, key cannot be stolen
```

---

## Storage Architecture

### Redis Data Model

```
┌────────────────────────────────────────────────────────────┐
│                     Redis Data Schema                      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  KEY: session:abc123 (Hash) ─ TTL: 86400 seconds          │
│  ┌────────────────────────────────────────────────────┐   │
│  │ user_id       : "user-456"                         │   │
│  │ public_key    : "{\"kty\":\"EC\",\"crv\":\"P-256\",...}" │   │
│  │ created_at    : 1640000000                         │   │
│  │ last_access   : 1640001000                         │   │
│  │ ip_address    : "192.168.1.1"                      │   │
│  │ user_agent    : "Mozilla/5.0..."                   │   │
│  │ device_id     : "device-789"                       │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  KEY: nonce:xyz789 (String) ─ TTL: 300 seconds            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Value: "1"                                         │   │
│  │ Purpose: Single-use token                          │   │
│  │ Consumed via: GETDEL (atomic)                      │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  KEY: ratelimit:session:abc123 (Sorted Set)               │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Score      | Member                                │   │
│  │ 1640000000 | request-1                             │   │
│  │ 1640000001 | request-2                             │   │
│  │ 1640000002 | request-3                             │   │
│  │ ...                                                │   │
│  │                                                    │   │
│  │ Operations:                                        │   │
│  │ • ZADD: Add new request with timestamp             │   │
│  │ • ZCOUNT: Count requests in time window            │   │
│  │ • ZREMRANGEBYSCORE: Remove old entries             │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  KEY: pubkeys:user-456 (Hash)                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │ session:abc123 : "{JWK public key}"                │   │
│  │ session:def456 : "{JWK public key}"                │   │
│  │ session:ghi789 : "{JWK public key}"                │   │
│  │                                                    │   │
│  │ Purpose: Track all active sessions for user        │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    Session Lifecycle                        │
└─────────────────────────────────────────────────────────────┘

1. LOGIN
   ├─ Generate ECDSA key pair (client)
   ├─ Export public key
   ├─ Send to server with credentials
   └─ Server stores:
      ├─ Redis: session:abc123 ← {user_id, public_key, ...}
      └─ Redis: pubkeys:user-456 ← session:abc123

2. ACTIVE SESSION
   ├─ Every request:
   │  ├─ Verify signature using stored public key
   │  ├─ Validate nonce (GETDEL)
   │  └─ Update last_access timestamp
   │
   └─ Periodic:
      └─ Background job: Remove expired sessions

3. LOGOUT
   ├─ Delete session:abc123 (Redis)
   ├─ Remove from pubkeys:user-456
   └─ Client discards private key (IndexedDB clear)

4. TIMEOUT (86400 seconds / 24 hours)
   ├─ Redis auto-expires session:abc123
   └─ Client must re-authenticate
```

---

## Performance Optimization Strategies

### 1. Connection Pooling

```go
// Redis connection pool
var redisPool = &redis.Pool{
    MaxIdle:     10,
    MaxActive:   100,
    IdleTimeout: 240 * time.Second,
    Dial: func() (redis.Conn, error) {
        return redis.Dial("tcp", "localhost:6379")
    },
}
```

### 2. Signature Caching

```typescript
// Cache recently verified signatures (server-side)
const signatureCache = new LRUCache({
    max: 10000,
    ttl: 5000 // 5 seconds
});

function verifyCached(signature: string, message: string): boolean {
    const key = `${signature}:${hash(message)}`;
    if (signatureCache.has(key)) {
        return signatureCache.get(key);
    }
    
    const valid = expensiveVerify(signature, message);
    signatureCache.set(key, valid);
    return valid;
}
```

### 3. Batch Operations

```go
// Batch Redis operations using pipelining
pipe := client.Pipeline()
pipe.HGet(ctx, sessionKey, "public_key")
pipe.GetDel(ctx, nonceKey)
pipe.ZCard(ctx, rateLimitKey)
results, err := pipe.Exec(ctx)
```

### 4. CDN for Static Assets

```nginx
# Cache signing iframe (immutable)
location /signing-iframe.js {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## Monitoring & Observability

### Key Metrics

1. **Signature Verification Rate**
   - Successful verifications per second
   - Failed verifications (potential attack indicator)

2. **Nonce Reuse Attempts**
   - Count of GETDEL misses (replay attack attempts)

3. **Session Creation Rate**
   - New sessions per minute
   - Spike detection for credential stuffing

4. **Interaction Anomalies**
   - Non-human trajectory detections
   - Timing violations

5. **System Performance**
   - Signature verification latency (p50, p95, p99)
   - Redis operation latency
   - Memory usage

### Logging

```go
// Structured logging example
log.WithFields(log.Fields{
    "session_id": sessionID,
    "user_id": userID,
    "event": "signature_verification_failed",
    "reason": "invalid_signature",
    "ip_address": clientIP,
    "user_agent": userAgent,
}).Warn("Authentication failure")
```

---

## Scalability Considerations

### Horizontal Scaling

1. **Stateless API Servers**: Multiple Go instances behind load balancer
2. **Redis Cluster**: Sharded session storage across nodes
3. **CDN**: Static assets (signing iframe) served from edge locations

### Load Distribution

```
       ┌─────────────┐
       │Load Balancer│
       └──────┬──────┘
              │
      ────────┴────────
     │                │
┌────▼────┐      ┌────▼────┐
│ API-1   │      │ API-2   │
└────┬────┘      └────┬────┘
     │                │
     └────────┬────────┘
              │
      ┌───────▼────────┐
      │ Redis Cluster  │
      │  ┌──┐  ┌──┐    │
      │  │N1│  │N2│    │
      │  └──┘  └──┘    │
      └────────────────┘
```

This architecture documentation provides a comprehensive technical overview of the PAN system. Would you like me to create additional documentation for deployment, API reference, or troubleshooting?
