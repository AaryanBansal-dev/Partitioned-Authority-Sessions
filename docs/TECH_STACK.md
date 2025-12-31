# Technology Stack Summary

Quick reference guide for the Partitioned Authority Sessions (PAN) technology stack.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (Client-Side)                     │
├─────────────────────────────────────────────────────────────────┤
│ Main App (example.com)          │  Signing Iframe              │
│ • TypeScript                     │  (sign.example.com)          │
│ • Modern ES2020+                 │  • Vanilla TypeScript        │
│ • WebCrypto API                  │  • No frameworks             │
│ • postMessage communication      │  • IndexedDB storage         │
│ • Interaction tracking           │  • ECDSA signing             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼ HTTPS
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Server-Side)                        │
├─────────────────────────────────────────────────────────────────┤
│ API Server                                                      │
│ • Go 1.21+                                                      │
│ • crypto/ecdsa (signature verification)                         │
│ • crypto/sha256 (hashing)                                       │
│ • net/http (HTTP server)                                        │
│ • Goroutines (concurrency)                                      │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼ TCP/IP
┌─────────────────────────────────────────────────────────────────┐
│                    Storage Layer                                │
├─────────────────────────────────────────────────────────────────┤
│ Redis 7.0+                                                      │
│ • Session storage (Hashes)                                      │
│ • Nonce management (Strings with GETDEL)                        │
│ • Rate limiting (Sorted Sets)                                   │
│ • Public key registry (Hashes)                                  │
│ • AOF + RDB persistence                                         │
│ • Optional: Redis Cluster for horizontal scaling               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer-by-Layer Breakdown

### Layer 1: Main Application (`example.com`)

| Aspect | Technology | Purpose |
|--------|------------|---------|
| **Language** | TypeScript | Type safety, modern features |
| **Runtime** | Browser (ES2020+) | Client-side execution |
| **Build Tool** | Vite | Fast development, optimized builds |
| **Module System** | ESNext | Tree-shaking, code splitting |
| **APIs Used** | DOM, Fetch, postMessage | Browser integration |

**Key Files**:
- `interaction-tracker.ts` - Mouse/keyboard event tracking
- `signing-client.ts` - Communication with signing iframe
- `session-manager.ts` - Session lifecycle management

**Dependencies**:
```json
{
  "typescript": "^5.0.0",
  "vite": "^5.0.0"
}
```

**Build Command**:
```bash
bun run build
```

**Output**: Minified JavaScript + Source maps

---

### Layer 2: Signing Iframe (`sign.example.com`)

| Aspect | Technology | Purpose |
|--------|------------|---------|
| **Language** | TypeScript (Vanilla) | No framework overhead |
| **Runtime** | Browser (isolated origin) | Cross-origin security |
| **Storage** | IndexedDB | Origin-locked key storage |
| **Crypto** | WebCrypto API | Non-extractable ECDSA keys |

**Why Vanilla TypeScript?**
- ✅ Minimal attack surface
- ✅ No third-party dependencies to audit
- ✅ Faster load time (smaller bundle)
- ✅ Complete control over execution
- ✅ Easier security review

**Browser APIs**:
```typescript
// Key generation
crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,  // Non-extractable
  ['sign']
)

// Signing
crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  privateKey,
  data
)

// Storage
indexedDB.open('pan-signing', 1)
```

**Key File**:
- `signing-iframe.ts` - Complete implementation (< 500 lines)

**Build Command**:
```bash
bun run build
```

---

### Layer 3: API Server (Go)

| Aspect | Technology | Purpose |
|--------|------------|---------|
| **Language** | Go 1.21+ | Performance, safety, concurrency |
| **HTTP Server** | net/http | Standard library HTTP/2 support |
| **Router** | gorilla/mux | RESTful routing |
| **Redis Client** | go-redis/redis | Connection pooling, pipelining |
| **Crypto** | crypto/* (stdlib) | ECDSA verification, hashing |

**Go Standard Library Packages**:
```go
import (
    "crypto/ecdsa"     // ECDSA signature verification
    "crypto/elliptic"  // P-256 curve operations
    "crypto/sha256"    // SHA-256 hashing
    "crypto/x509"      // Public key parsing
    "encoding/base64"  // Base64 encoding/decoding
    "encoding/json"    // JSON parsing
    "net/http"         // HTTP server
    "time"             // Timestamp validation
)
```

**Third-Party Dependencies**:
```go
require (
    github.com/go-redis/redis/v8 v8.11.5
    github.com/gorilla/mux v1.8.1
    github.com/prometheus/client_golang v1.17.0
)
```

**Key Components**:

1. **Verification Middleware**:
   ```go
   // middleware/verification.go
   func (vm *VerificationMiddleware) VerifyRequest(next http.Handler) http.Handler
   ```

2. **Session Manager**:
   ```go
   // session/manager.go
   type SessionManager struct {
       redis *redis.Client
   }
   ```

3. **Nonce Manager**:
   ```go
   // nonce/manager.go
   func (nm *NonceManager) ValidateAndConsume(nonce string) (bool, error)
   ```

**Performance**:
- Goroutines handle 10,000+ concurrent connections
- Connection pooling reduces Redis latency
- Zero-allocation JSON parsing for hot paths
- Native ECDSA verification (~1ms per signature)

**Build Command**:
```bash
go build -o pan-server -ldflags="-s -w" ./cmd/server
```

---

### Layer 4: Cryptography

#### Client-Side (WebCrypto API)

| Property | Value |
|----------|-------|
| **Algorithm** | ECDSA (Elliptic Curve Digital Signature Algorithm) |
| **Curve** | P-256 (secp256r1, prime256v1) |
| **Hash** | SHA-256 |
| **Key Size** | 256 bits |
| **Signature Size** | 64 bytes (R: 32 bytes, S: 32 bytes) |
| **Security Level** | 128-bit (equivalent to AES-128) |

**Key Generation**:
```typescript
const keyPair = await crypto.subtle.generateKey(
  {
    name: 'ECDSA',
    namedCurve: 'P-256'
  },
  false,  // ❌ Non-extractable (cannot be exported)
  ['sign']
);
```

**Signing**:
```typescript
const signature = await crypto.subtle.sign(
  {
    name: 'ECDSA',
    hash: 'SHA-256'
  },
  privateKey,
  messageBytes
);
```

#### Server-Side (Go crypto/*)

**Verification**:
```go
import (
    "crypto/ecdsa"
    "crypto/sha256"
    "math/big"
)

func verifySignature(publicKey *ecdsa.PublicKey, message, signature []byte) bool {
    hash := sha256.Sum256(message)
    
    r := new(big.Int).SetBytes(signature[:32])
    s := new(big.Int).SetBytes(signature[32:])
    
    return ecdsa.Verify(publicKey, hash[:], r, s)
}
```

**Public Key Parsing** (from JWK):
```go
func parsePublicKeyJWK(jwkJSON string) (*ecdsa.PublicKey, error) {
    var jwk struct {
        Kty string `json:"kty"`
        Crv string `json:"crv"`
        X   string `json:"x"`
        Y   string `json:"y"`
    }
    
    json.Unmarshal([]byte(jwkJSON), &jwk)
    
    x := new(big.Int).SetBytes(base64Decode(jwk.X))
    y := new(big.Int).SetBytes(base64Decode(jwk.Y))
    
    return &ecdsa.PublicKey{
        Curve: elliptic.P256(),
        X:     x,
        Y:     y,
    }, nil
}
```

---

### Layer 5: Storage (Redis)

| Aspect | Technology | Purpose |
|--------|------------|---------|
| **Database** | Redis 7.0+ | In-memory key-value store |
| **Persistence** | AOF + RDB | Durability with performance |
| **Data Structures** | Hashes, Strings, Sorted Sets | Optimized operations |
| **Atomic Ops** | GETDEL, HSET, ZADD | Race condition prevention |
| **TTL** | Automatic expiration | No manual cleanup needed |

**Data Model**:

| Entity | Structure | Key Pattern | TTL |
|--------|-----------|-------------|-----|
| Sessions | Hash | `session:{id}` | 24 hours |
| Nonces | String | `nonce:{value}` | 5 minutes |
| Rate Limits | Sorted Set | `ratelimit:{type}:{id}` | 1 hour |
| Public Keys | Hash | `pubkeys:{user_id}` | Persistent |

**Critical Operations**:

```redis
# Session storage
HSET session:abc123 user_id "user-456" public_key "{...}" ...
EXPIRE session:abc123 86400

# Nonce consumption (atomic!)
GETDEL nonce:xyz789

# Rate limiting
ZADD ratelimit:session:abc123 1640000000 "req-uuid"
ZCOUNT ratelimit:session:abc123 1639999940 +inf
```

**Configuration**:
```conf
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

**Go Client**:
```go
import "github.com/go-redis/redis/v8"

client := redis.NewClient(&redis.Options{
    Addr:         "localhost:6379",
    Password:     os.Getenv("REDIS_PASSWORD"),
    DB:           0,
    PoolSize:     100,
    MinIdleConns: 10,
})
```

---

## Security Technologies

### Browser Security Mechanisms

| Mechanism | Description | Benefit |
|-----------|-------------|---------|
| **Same-Origin Policy** | Isolates `example.com` from `sign.example.com` | XSS cannot access signing iframe |
| **WebCrypto Non-Extractable Keys** | Keys cannot be exported from browser | Private key theft impossible |
| **IndexedDB Origin Isolation** | Storage isolated per origin | Cross-origin data access blocked |
| **postMessage Origin Validation** | Messages verified by origin | Prevents unauthorized signing requests |

### Cryptographic Security

| Technology | Purpose |
|-----------|---------|
| **ECDSA P-256** | Digital signatures (session authorization) |
| **SHA-256** | Hashing (message integrity, element identification) |
| **Random Nonces** | Replay attack prevention |
| **HTTPS/TLS 1.3** | Transport encryption |

### Infrastructure Security

| Technology | Purpose |
|-----------|---------|
| **Nginx** | Reverse proxy, SSL termination, security headers |
| **Let's Encrypt** | Free SSL certificates |
| **Fail2Ban** | Intrusion prevention |
| **UFW** | Firewall |
| **Redis AUTH** | Database authentication |

---

## Development Tools

### Build & Development

| Tool | Purpose | Command |
|------|---------|---------|
| **Bun** | Package manager (per user rules) | `bun install`, `bun run dev` |
| **TypeScript Compiler** | Type checking | `tsc --noEmit` |
| **Vite** | Development server & bundler | `vite dev`, `vite build` |
| **Go Compiler** | Backend compilation | `go build` |

### Testing

| Tool | Purpose |
|------|---------|
| **Vitest** | Unit testing (TypeScript) |
| **Go testing** | Unit testing (Go) |
| **Playwright** | E2E testing |
| **k6** | Load testing |

### Monitoring

| Tool | Purpose |
|------|---------|
| **Prometheus** | Metrics collection |
| **Grafana** | Metrics visualization |
| **ELK Stack** | Log aggregation |
| **Redis Exporter** | Redis metrics for Prometheus |

---

## Deployment Stack

### Infrastructure

| Component | Technology |
|-----------|------------|
| **Load Balancer** | Nginx / HAProxy / AWS ALB |
| **Web Server** | Nginx |
| **Application Server** | Go binary (systemd service) |
| **Database** | Redis (standalone or cluster) |
| **CDN** | Cloudflare / AWS CloudFront |

### Orchestration

| Scale | Technology |
|-------|------------|
| **Single Server** | Systemd |
| **Multi-Server** | Docker Compose |
| **Kubernetes** | K8s + Helm charts |

### CI/CD

```yaml
# .github/workflows/deploy.yml
- Build TypeScript → Vite
- Build Go → go build
- Run tests → Vitest, go test
- Deploy to staging
- Run E2E tests
- Deploy to production
```

---

## Browser Compatibility

| Browser | Minimum Version | WebCrypto | IndexedDB | postMessage |
|---------|----------------|-----------|-----------|-------------|
| Chrome | 60+ | ✅ | ✅ | ✅ |
| Firefox | 55+ | ✅ | ✅ | ✅ |
| Safari | 11+ | ✅ | ✅ | ✅ |
| Edge | 79+ | ✅ | ✅ | ✅ |

---

## Performance Characteristics

| Operation | Latency | Throughput |
|-----------|---------|------------|
| **Key Generation** (login) | 50ms | N/A |
| **Signature Generation** | 3ms | ~300/sec per client |
| **Signature Verification** | 1ms | ~10,000/sec per core |
| **Redis Session Lookup** | 0.3ms | ~50,000/sec |
| **postMessage Round-trip** | 0.8ms | N/A |
| **Total Request Overhead** | ~5ms | ~5,000 req/sec (single server) |

---

## Documentation Index

- **[README.md](../README.md)** - Project overview and quick start
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Detailed architecture documentation
- **[API.md](API.md)** - Complete API reference
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment guide
- **[REDIS_STORAGE.md](REDIS_STORAGE.md)** - Redis implementation details
- **[problem.md](../problem.md)** - Problem statement and motivation
- **[plan.md](../plan.md)** - Original design document
- **[context.md](../context.md)** - Learning guide

---

## Quick Reference Commands

### Development

```bash
# Install dependencies
bun install

# Run main app
cd main-app && bun run dev

# Run signing iframe
cd signing-iframe && bun run dev

# Run API server
cd api-server && go run ./cmd/server

# Run Redis
redis-server
```

### Production

```bash
# Build frontend
bun run build

# Build backend
go build -o pan-server ./cmd/server

# Start services
sudo systemctl start redis-server
sudo systemctl start pan-api
sudo systemctl start nginx
```

### Testing

```bash
# Unit tests
bun test
go test ./...

# E2E tests
bun run test:e2e

# Load test
k6 run load-test.js
```

---

## Environment Variables

```bash
# Development
NODE_ENV=development
VITE_API_URL=http://localhost:8080
VITE_SIGNING_ORIGIN=http://localhost:3001

# Production
NODE_ENV=production
REDIS_HOST=localhost
REDIS_PASSWORD=your_secure_password
GO_ENV=production
```

---

**For detailed information on any layer, see the corresponding documentation file.**
