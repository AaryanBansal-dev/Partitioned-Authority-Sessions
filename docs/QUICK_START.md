# Quick Start Guide

Get PAN up and running in 5 minutes.

---

## Prerequisites

Ensure you have these installed:

- ✅ **Bun** (latest) - `curl -fsSL https://bun.sh/install | bash`
- ✅ **Go** 1.21+ - `go version`
- ✅ **Redis** 7.0+ - `redis-server --version`
- ✅ **Node.js** 18+ (for some tools) - `node --version`

---

## 1. Clone & Install

```bash
# Clone the repository
git clone https://github.com/yourusername/partitioned-authority-sessions.git
cd partitioned-authority-sessions

# Install dependencies for main app
cd main-app
bun install
cd ..

# Install dependencies for signing iframe
cd signing-iframe
bun install
cd ..

# Install Go dependencies
cd api-server
go mod download
cd ..
```

**Time**: ~2 minutes

---

## 2. Start Redis

```bash
# Start Redis in a new terminal
redis-server

# Or start as service
sudo systemctl start redis-server

# Verify it's running
redis-cli ping
# Should output: PONG
```

**Time**: 10 seconds

---

## 3. Configure Environment

Create `.env` files:

### Main App (`.env`)

```bash
# main-app/.env
VITE_API_URL=http://localhost:8080
VITE_SIGNING_ORIGIN=http://localhost:3001
NODE_ENV=development
```

### Signing Iframe (`.env`)

```bash
# signing-iframe/.env
VITE_ALLOWED_ORIGINS=http://localhost:3000
NODE_ENV=development
```

### API Server (`.env`)

```bash
# api-server/.env
PORT=8080
ENVIRONMENT=development
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
SESSION_TTL=86400
NONCE_TTL=300
```

**Time**: 1 minute

---

## 4. Start Development Servers

Open **4 terminal windows**:

### Terminal 1: Main Application

```bash
cd main-app
bun run dev
```

Output:
```
  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

### Terminal 2: Signing Iframe

```bash
cd signing-iframe
bun run dev
```

Output:
```
  ➜  Local:   http://localhost:3001/
  ➜  Network: use --host to expose
```

### Terminal 3: API Server

```bash
cd api-server
go run ./cmd/server
```

Output:
```
2024/01/01 12:00:00 Starting PAN API Server on :8080
2024/01/01 12:00:00 Connected to Redis at localhost:6379
2024/01/01 12:00:00 Server ready
```

### Terminal 4: Redis (if not running as service)

```bash
redis-server
```

**Time**: 30 seconds

---

## 5. Test the System

Open your browser to `http://localhost:3000`

### Test Authentication Flow

1. **Create an account** (or use test credentials):
   - Username: `test@example.com`
   - Password: `TestPassword123!`

2. **Login** - Watch the browser console:
   ```
   [PAN] Generating ECDSA key pair...
   [PAN] Key pair generated in 45ms
   [PAN] Public key registered with server
   [PAN] Session established: abc123
   ```

3. **Perform a protected action** (e.g., click "Transfer Funds"):
   ```
   [PAN] Capturing interaction...
   [PAN] Requesting signature from iframe...
   [PAN] Signature generated in 3ms
   [PAN] Request signed and sent
   [PAN] Action completed successfully
   ```

### Verify in Redis

```bash
redis-cli

# List all sessions
KEYS session:*

# View a session
HGETALL session:abc123

# View nonces
KEYS nonce:*

# Exit
exit
```

**Time**: 2 minutes

---

## Architecture Verification

Verify the three-layer security:

### 1. Session Token (Identifier Only)

Open browser DevTools → Application → Cookies:
```
session_id=abc123; HttpOnly; Secure; SameSite=Strict
```

This token alone grants **no authority**.

### 2. Signing Iframe (Isolated)

Open DevTools → Console:
```javascript
// Try to access signing iframe from main app
document.querySelector('iframe[src*="localhost:3001"]').contentWindow
// Result: SecurityError - Cross-origin access blocked ✅
```

### 3. Interaction Proof (Non-Fabricable)

Check network request headers:
```
X-Session-ID: abc123
X-Signature: MEUCIQDt3IE...
X-Interaction-Proof: {"timestamp":1640000000,"trajectory":[...],"velocity":...}
```

---

## Testing Security Features

### Test 1: Token Theft Simulation

```javascript
// In browser console
const stolenToken = document.cookie.match(/session_id=([^;]+)/)[1];
console.log('Stolen token:', stolenToken);

// Try to make request with stolen token (simulating attacker)
fetch('http://localhost:8080/api/protected', {
    headers: { 'X-Session-ID': stolenToken }
});

// Result: 401 Unauthorized - No signature ✅
```

### Test 2: XSS Signing Access

```javascript
// Try to access signing iframe's crypto context
const iframe = document.querySelector('iframe[src*="localhost:3001"]');
const privateKey = iframe.contentWindow.crypto.subtle.exportKey(/*...*/);

// Result: SecurityError - Same-Origin Policy blocks access ✅
```

### Test 3: Fake Interaction Proof

```javascript
// Try to send fake interaction proof
fetch('http://localhost:8080/api/protected', {
    method: 'POST',
    headers: {
        'X-Session-ID': 'abc123',
        'X-Signature': 'fake_signature',
        'X-Interaction-Proof': JSON.stringify({
            timestamp: Date.now(),
            trajectory: [],
            velocity: 0
        })
    }
});

// Result: 401 Unauthorized - Invalid signature ✅
```

### Test 4: Nonce Reuse (Replay Attack)

```bash
# In terminal, watch Redis
redis-cli MONITOR

# Make a request (observe nonce)
# Try to replay the exact same request
# Result: 401 Unauthorized - Nonce already consumed ✅
```

---

## Common Development Tasks

### View Logs

```bash
# API Server logs
tail -f api-server/logs/app.log

# Nginx logs (if running)
tail -f /var/log/nginx/access.log
```

### Reset Redis

```bash
redis-cli FLUSHDB
```

### Regenerate Keys

```bash
# In browser console
localStorage.clear();
indexedDB.deleteDatabase('pan-signing');
location.reload();
```

### Debug Signature Verification

Server-side:
```go
// api-server/middleware/verification.go
// Add debug logging
log.Printf("Verifying signature: %s", signature)
log.Printf("Public key: %s", publicKey)
log.Printf("Message: %s", canonicalMessage)
```

Client-side:
```typescript
// signing-iframe/src/signing.ts
console.log('Signing message:', message);
console.log('Generated signature:', signature);
```

---

## Performance Testing

### Load Test with k6

```bash
# Install k6
brew install k6  # macOS
# or
sudo apt install k6  # Ubuntu

# Run load test
k6 run scripts/load-test.js
```

Expected output:
```
scenarios: (100.00%) 1 scenario, 100 max VUs, 1m30s max duration
     ✓ signature verification passed
     ✓ response time < 500ms

     checks.........................: 100.00% ✓ 15000 ✗ 0
     http_req_duration..............: avg=12ms min=5ms med=10ms max=85ms p(95)=25ms
     http_reqs......................: 15000   250/s
     vus............................: 100     min=100 max=100
```

### Manual Performance Check

```bash
# Measure signature verification time
time redis-cli -x ECHO "test" < /dev/null

# Benchmark Redis
redis-benchmark -q -n 10000 -c 50 -t get,set
```

---

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Redis Connection Refused

```bash
# Check if Redis is running
ps aux | grep redis

# Start Redis
redis-server

# Check logs
tail -f /var/log/redis/redis-server.log
```

### CORS Errors

Check API server logs for:
```
CORS error: Origin http://localhost:3000 not allowed
```

Fix in `api-server/.env`:
```
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### Signature Verification Fails

Common causes:
1. **Clock skew**: Check system time
2. **Key mismatch**: Regenerate session (logout/login)
3. **Nonce expired**: Reduce time between nonce generation and use
4. **Message format**: Check canonical message formatting

Debug:
```bash
# Check server logs
tail -f api-server/logs/app.log | grep "signature"

# Check Redis for session
redis-cli HGETALL session:abc123
```

---

## Next Steps

Now that you have PAN running:

1. **📚 Read the Docs**:
   - [Architecture](docs/ARCHITECTURE.md) - Understand the design
   - [API Reference](docs/API.md) - Build your integration
   - [Security](plan.md) - Learn attack resistance

2. **🔧 Customize**:
   - Add your own protected endpoints
   - Customize interaction tracking
   - Implement your UI

3. **🚀 Deploy**:
   - Follow [Deployment Guide](docs/DEPLOYMENT.md)
   - Set up monitoring
   - Configure production environment

4. **🧪 Test**:
   - Write integration tests
   - Perform security audit
   - Load test your configuration

---

## Quick Command Reference

```bash
# Development
bun run dev        # Start dev server
bun run build      # Production build
bun test           # Run tests

# Go
go run .           # Run API server
go build           # Build binary
go test ./...      # Run tests

# Redis
redis-cli          # Redis CLI
redis-server       # Start Redis
redis-cli MONITOR  # Watch commands

# Docker (alternative)
docker-compose up  # Start all services
```

---

## Getting Help

- **Documentation**: Check `docs/` folder
- **Issues**: [GitHub Issues](https://github.com/yourusername/pan/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/pan/discussions)
- **Security**: security@example.com

---

**You're all set! 🎉**

PAN is now running locally. Start building secure, session-hijacking-resistant applications!
