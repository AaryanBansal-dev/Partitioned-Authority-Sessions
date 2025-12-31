# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability within PAN, please follow these steps:

### 1. Do NOT Open a Public Issue

Security vulnerabilities should not be disclosed publicly until they have been addressed.

### 2. Email Us Directly

Send a detailed report to the repository owner via GitHub private message or create a [GitHub Security Advisory](https://github.com/AaryanBansal-dev/Partitioned-Authority-Sessions/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### 3. Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity (Critical: 24-72 hours, High: 1-2 weeks)

### 4. Recognition

We believe in recognizing security researchers who help us:
- Credit in CHANGELOG.md (if desired)
- Acknowledgment in security advisory
- Hall of Fame on repository

## Security Design

PAN was designed with security as the primary goal:

### Threat Model

**Protected Against:**
- Session hijacking via XSS
- Cookie theft and replay
- Man-in-the-middle session attacks
- Browser extension key extraction
- Memory scraping for session tokens

**Not Protected Against:**
- Social engineering (user performs action themselves)
- Pre-authentication attacks (credential phishing)
- Physical device compromise with keylogger
- Nation-state browser 0-days

### Security Architecture

1. **Origin Isolation**: Signing iframe on separate subdomain
2. **Non-Extractable Keys**: WebCrypto enforcement prevents key export
3. **Interaction Proofs**: Human behavior validation
4. **Single-Use Nonces**: Replay attack prevention
5. **Cryptographic Binding**: ECDSA P-256 signatures

## Security Best Practices

When deploying PAN:

- ✅ Always use HTTPS for all origins
- ✅ Set proper CSP headers
- ✅ Use HttpOnly, Secure, SameSite=Strict cookies
- ✅ Configure short nonce TTLs (≤5 minutes)
- ✅ Monitor and alert on signature failures
- ✅ Implement rate limiting
- ✅ Use Redis with authentication
- ✅ Keep dependencies updated

## Audit History

- **2024-01**: Initial security review
- *More audits pending*

---

Thank you for helping keep PAN and its users safe!
