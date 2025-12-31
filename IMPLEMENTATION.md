# PAN Implementation Guide

> **Step-by-step guide to integrate Partitioned Authority Sessions into your application.**

## Table of Contents

1. [Quick Start](#quick-start)
2. [Client-Side Setup](#client-side-setup)
3. [Server-Side Setup](#server-side-setup)
4. [Signing Iframe Deployment](#signing-iframe-deployment)
5. [Making Secure Requests](#making-secure-requests)
6. [Security Checklist](#security-checklist)

---

## Quick Start

### Installation

```bash
npm install partitioned-authority-sessions
# or
bun add partitioned-authority-sessions
```

### Basic Architecture

```
Your App (example.com)     Signing Iframe (sign.example.com)     Your API
        │                              │                            │
        │ 1. User clicks button        │                            │
        ├──────────────────────────────►                            │
        │                              │ 2. Sign with private key   │
        │◄──────────────────────────────                            │
        │                              │                            │
        │ 3. Send signed request ──────────────────────────────────►│
        │                              │    4. Verify signature     │
        │◄────────────────────────────────────────────── 5. Response│
```

---

## Client-Side Setup

### Step 1: Initialize the Interaction Tracker

```typescript
import { InteractionTracker } from 'partitioned-authority-sessions/client';

// Initialize once when your app loads
const tracker = new InteractionTracker();
```

> The tracker automatically captures mouse movements, clicks, and timing data.

### Step 2: Set Up the Signing Client

```typescript
import { SigningClient } from 'partitioned-authority-sessions/client';

// Point to your signing iframe URL
const signingClient = new SigningClient({
  iframeUrl: 'https://sign.yourdomain.com',
  allowedOrigins: ['https://yourdomain.com']
});

// Wait for iframe to be ready
await signingClient.waitReady();
```

### Step 3: Handle Login

```typescript
async function login(username: string, password: string) {
  // 1. Generate key pair in signing iframe
  const publicKey = await signingClient.initialize();
  
  // 2. Send to your auth endpoint with credentials
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, publicKey })
  });
  
  return response.json();
}
```

### Step 4: Make Authenticated Requests

```typescript
async function secureAction(actionName: string, payload: any) {
  // 1. Get fresh nonce from server
  const { nonce } = await fetch('/api/nonce').then(r => r.json());
  
  // 2. Get interaction proof (captures mouse trajectory, timing, etc.)
  const proof = tracker.getInteractionProof({
    type: 'api_call',
    context: '/api/action',
    displayName: actionName,  // Must match button text user clicked
    payload
  }, nonce);
  
  if (!proof) {
    throw new Error('No valid user interaction detected');
  }
  
  // 3. Get signature from isolated iframe
  const signature = await signingClient.sign({ 
    type: 'api_call', 
    displayName: actionName, 
    payload 
  }, proof, nonce);
  
  // 4. Send signed request
  return fetch('/api/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
      'X-Interaction-Proof': JSON.stringify(proof)
    },
    body: JSON.stringify(payload)
  });
}
```

---

## Server-Side Setup

### Step 1: Session Store

```typescript
import { SessionStore } from 'partitioned-authority-sessions/server';

const store = new SessionStore({
  redis: {
    host: 'localhost',
    port: 6379,
    password: process.env.REDIS_PASSWORD
  },
  sessionTTL: 86400,  // 24 hours
  nonceTTL: 300       // 5 minutes
});
```

### Step 2: Login Handler

```typescript
app.post('/api/auth/login', async (req, res) => {
  const { username, password, publicKey } = req.body;
  
  // 1. Verify credentials (your existing auth logic)
  const user = await verifyCredentials(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // 2. Create PAN session with user's public key
  const session = await store.createSession({
    userId: user.id,
    publicKey: JSON.stringify(publicKey),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  // 3. Return session (set HttpOnly cookie)
  res.cookie('session_id', session.sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  });
  
  res.json({ success: true, sessionId: session.sessionId });
});
```

### Step 3: Verification Middleware

```typescript
import { verifySignature, validateInteractionProof } from 'partitioned-authority-sessions/server';

async function panMiddleware(req, res, next) {
  const sessionId = req.cookies.session_id;
  const signature = req.headers['x-signature'];
  const proofJson = req.headers['x-interaction-proof'];
  
  // 1. Get session
  const session = await store.getSession(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  
  // 2. Parse and validate proof
  const proof = JSON.parse(proofJson);
  
  // 3. Validate nonce (single-use)
  const nonceValid = await store.consumeNonce(proof.nonce);
  if (!nonceValid) {
    return res.status(401).json({ error: 'Invalid or reused nonce' });
  }
  
  // 4. Validate interaction proof
  const proofValid = validateInteractionProof(proof);
  if (!proofValid.valid) {
    return res.status(401).json({ error: proofValid.error });
  }
  
  // 5. Verify cryptographic signature
  const signatureValid = await verifySignature(
    session.publicKey,
    signature,
    req.body,
    proof
  );
  
  if (!signatureValid) {
    return res.status(401).json({ error: 'Signature verification failed' });
  }
  
  req.session = session;
  next();
}

// Use on protected routes
app.post('/api/transfer', panMiddleware, transferHandler);
```

### Step 4: Nonce Endpoint

```typescript
app.get('/api/nonce', async (req, res) => {
  const nonce = await store.generateNonce();
  res.json({ nonce, expiresAt: Date.now() + 300000 });
});
```

---

## Signing Iframe Deployment

### Step 1: Deploy to Subdomain

The signing iframe **must** be on a different origin (subdomain works):

- Main app: `https://app.yourdomain.com`
- Signing iframe: `https://sign.yourdomain.com`

### Step 2: Configure CSP Headers

```nginx
# Nginx config for sign.yourdomain.com
add_header Content-Security-Policy "frame-ancestors https://app.yourdomain.com";
add_header X-Frame-Options "ALLOW-FROM https://app.yourdomain.com";
```

### Step 3: Build and Deploy

```bash
cd signing-iframe
bun run build
# Deploy dist/ to sign.yourdomain.com
```

---

## Making Secure Requests

### HTML Button Setup

```html
<!-- data-action MUST match the actionName used in secureAction() -->
<button data-action="Transfer Funds" onclick="handleTransfer()">
  Transfer Funds
</button>
```

### JavaScript Handler

```javascript
async function handleTransfer() {
  try {
    const result = await secureAction('Transfer Funds', {
      to: 'recipient@example.com',
      amount: 100
    });
    console.log('Transfer successful:', result);
  } catch (error) {
    console.error('Transfer failed:', error.message);
  }
}
```

---

## Security Checklist

### Before Going to Production

- [ ] **HTTPS everywhere** - Both main app and signing iframe
- [ ] **Separate origins** - Signing iframe on different subdomain
- [ ] **HttpOnly cookies** - Session cookie cannot be read by JavaScript
- [ ] **SameSite=Strict** - Prevent CSRF attacks
- [ ] **CSP headers** - Restrict frame embedding to your domain only
- [ ] **Redis with password** - Secure your session store
- [ ] **Short nonce TTL** - 5 minutes maximum
- [ ] **Rate limiting** - Prevent brute force attacks
- [ ] **Monitor signature failures** - Log and alert on anomalies

### Why Each Component is Secure

| Component | Attack Vector | Protection |
|-----------|---------------|------------|
| Session Token | XSS theft | Token alone grants no authority |
| Private Key | Memory scraping | Non-extractable WebCrypto key |
| Private Key | XSS access | Same-Origin Policy (different origin) |
| Signing | Replay attack | Single-use nonces |
| Signing | Fake interactions | Trajectory/timing analysis |

---

## Example: E-commerce Checkout

```typescript
// Button must have data-action matching displayName
<button data-action="Complete Purchase" onclick="checkout()">
  Complete Purchase ($99.99)
</button>

async function checkout() {
  await secureAction('Complete Purchase', {
    orderId: 'ORD-12345',
    amount: 99.99,
    currency: 'USD'
  });
}
```

---

## Troubleshooting

### "No valid user interaction detected"

The user didn't click anything matching the action. Ensure:
1. Button has `data-action` attribute
2. `displayName` in code matches button text exactly

### "Signature verification failed"

Check that:
1. Server and client use the same canonical message format
2. Public key was stored correctly during login
3. Nonce hasn't expired

### "Invalid or reused nonce"

The nonce was already used or expired. Get a fresh nonce before each request.

---

## Need Help?

- 📖 [Full Documentation](https://github.com/AaryanBansal-dev/Partitioned-Authority-Sessions)
- 🐛 [Report Issues](https://github.com/AaryanBansal-dev/Partitioned-Authority-Sessions/issues)
- 💬 [Discussions](https://github.com/AaryanBansal-dev/Partitioned-Authority-Sessions/discussions)
