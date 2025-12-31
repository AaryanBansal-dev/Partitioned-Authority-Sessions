# Deployment Guide

Production deployment guide for Partitioned Authority Sessions (PAN).

---

## Table of Contents

1. [Infrastructure Requirements](#infrastructure-requirements)
2. [Pre-deployment Checklist](#pre-deployment-checklist)
3. [DNS & SSL Configuration](#dns--ssl-configuration)
4. [Redis Deployment](#redis-deployment)
5. [API Server Deployment](#api-server-deployment)
6. [Frontend Deployment](#frontend-deployment)
7. [Security Hardening](#security-hardening)
8. [Monitoring & Logging](#monitoring--logging)
9. [Disaster Recovery](#disaster-recovery)
10. [Scaling Strategies](#scaling-strategies)

---

## Infrastructure Requirements

### Minimum Requirements (Small Scale)

**API Server:**
- 2 CPU cores
- 4 GB RAM
- 20 GB SSD storage
- 100 Mbps network

**Redis:**
- 2 CPU cores
- 4 GB RAM
- 10 GB SSD storage (with persistence)
- 100 Mbps network

**Total:** 4 CPU cores, 8 GB RAM

**Capacity:** ~1,000 concurrent sessions, ~100 req/sec

### Recommended (Medium Scale)

**API Servers (2x for redundancy):**
- 4 CPU cores each
- 8 GB RAM each
- 50 GB SSD storage
- 1 Gbps network

**Redis Cluster (3 nodes):**
- 4 CPU cores each
- 8 GB RAM each
- 50 GB SSD storage
- 1 Gbps network

**Load Balancer:**
- 2 CPU cores
- 2 GB RAM
- 1 Gbps network

**Total:** 26 CPU cores, 50 GB RAM

**Capacity:** ~50,000 concurrent sessions, ~5,000 req/sec

### Enterprise Scale

**API Servers (5+ instances):**
- 8 CPU cores each
- 16 GB RAM each
- 100 GB SSD storage
- 10 Gbps network

**Redis Cluster (6+ nodes, 3 master + 3 replica):**
- 8 CPU cores each
- 16 GB RAM each
- 200 GB SSD storage
- 10 Gbps network

**Load Balancers (2x for HA):**
- 4 CPU cores each
- 4 GB RAM each
- 10 Gbps network

**Capacity:** 500,000+ concurrent sessions, 50,000+ req/sec

---

## Pre-deployment Checklist

### Security

- [ ] SSL/TLS certificates obtained for all domains
- [ ] Redis password set (strong, randomly generated)
- [ ] API server secrets configured
- [ ] CORS origins whitelisted
- [ ] CSP headers configured
- [ ] Rate limiting enabled
- [ ] Security headers configured (HSTS, X-Frame-Options, etc.)
- [ ] Firewall rules configured
- [ ] SSH key-based authentication enabled
- [ ] Fail2ban or equivalent installed

### Infrastructure

- [ ] DNS records configured
- [ ] Load balancer configured
- [ ] CDN configured (for static assets)
- [ ] Backup storage configured
- [ ] Monitoring tools installed
- [ ] Log aggregation configured
- [ ] Alerting rules configured

### Application

- [ ] Environment variables set
- [ ] Database migration completed
- [ ] Redis connection tested
- [ ] API health check endpoint verified
- [ ] Frontend build optimized (minification, compression)
- [ ] Signing iframe hosted on separate subdomain

### Testing

- [ ] Load testing completed
- [ ] Security audit completed
- [ ] Integration tests passing
- [ ] End-to-end tests passing
- [ ] Disaster recovery tested

---

## DNS & SSL Configuration

### DNS Records

```dns
; Main application
example.com.           A     203.0.113.10
www.example.com.       CNAME example.com.

; Signing iframe subdomain
sign.example.com.      A     203.0.113.10

; API server
api.example.com.       A     203.0.113.20

; Optional: CDN for static assets
cdn.example.com.       CNAME your-cdn-provider.com.
```

### SSL Certificate Setup

#### Option 1: Let's Encrypt (Free)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificates
sudo certbot --nginx -d example.com -d www.example.com
sudo certbot --nginx -d sign.example.com
sudo certbot --nginx -d api.example.com

# Auto-renewal
sudo certbot renew --dry-run
```

#### Option 2: Commercial Certificate

```bash
# Generate CSR
openssl req -new -newkey rsa:2048 -nodes \
  -keyout example.com.key \
  -out example.com.csr \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=example.com"

# Submit CSR to Certificate Authority
# Download certificate files
# Install on server
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/pan-system

# Main Application
server {
    listen 443 ssl http2;
    server_name example.com www.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # CSP header
    add_header Content-Security-Policy "default-src 'self'; \
        script-src 'self' 'unsafe-inline'; \
        style-src 'self' 'unsafe-inline'; \
        img-src 'self' data: https:; \
        font-src 'self' data:; \
        connect-src 'self' https://api.example.com; \
        frame-src https://sign.example.com; \
        frame-ancestors 'none';" always;

    # Static files
    location / {
        root /var/www/pan/main-app;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# Signing Iframe
server {
    listen 443 ssl http2;
    server_name sign.example.com;

    ssl_certificate /etc/letsencrypt/live/sign.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sign.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # CRITICAL: Frame embedding restrictions
    add_header X-Frame-Options "ALLOW-FROM https://example.com" always;
    add_header Content-Security-Policy "frame-ancestors https://example.com" always;

    # Other security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        root /var/www/pan/signing-iframe;
        try_files $uri $uri/ /index.html;
        
        # Immutable caching (content-addressed files)
        location ~* \.(js)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}

# API Server
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # CORS headers (handled by Go server, but can add here as backup)
    add_header Access-Control-Allow-Origin "https://example.com" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, X-Session-ID, X-Signature, X-Interaction-Proof" always;
    add_header Access-Control-Max-Age "3600" always;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name example.com www.example.com sign.example.com api.example.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Redis Deployment

### Single Instance (Development/Small Scale)

```bash
# Install Redis
sudo apt-get update
sudo apt-get install redis-server

# Configure Redis
sudo nano /etc/redis/redis.conf
```

**Redis Configuration:**

```conf
# /etc/redis/redis.conf

# Network
bind 127.0.0.1
port 6379
protected-mode yes

# Security
requirepass YOUR_STRONG_REDIS_PASSWORD_HERE

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Memory
maxmemory 2gb
maxmemory-policy allkeys-lru

# Performance
tcp-backlog 511
timeout 0
tcp-keepalive 300
```

```bash
# Start Redis
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Test connection
redis-cli -a YOUR_REDIS_PASSWORD ping
```

### Redis Cluster (Production)

**3-node cluster (minimum for HA):**

```bash
# On each node, install Redis
sudo apt-get install redis-server

# Configure each instance
# Node 1: 192.168.1.10:6379
# Node 2: 192.168.1.11:6379
# Node 3: 192.168.1.12:6379
```

**Cluster Configuration (each node):**

```conf
# /etc/redis/redis.conf

port 6379
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
appendonly yes

# Security
requirepass YOUR_CLUSTER_PASSWORD
masterauth YOUR_CLUSTER_PASSWORD

# Bind to private network interface
bind 192.168.1.10  # Change for each node
```

**Create Cluster:**

```bash
redis-cli --cluster create \
  192.168.1.10:6379 \
  192.168.1.11:6379 \
  192.168.1.12:6379 \
  --cluster-replicas 0 \
  -a YOUR_CLUSTER_PASSWORD
```

### Redis Sentinel (HA with automatic failover)

```bash
# Install on 3+ separate machines
# Configure sentinel on each

# /etc/redis/sentinel.conf
bind 0.0.0.0
port 26379
sentinel monitor mypan 192.168.1.10 6379 2
sentinel auth-pass mypan YOUR_REDIS_PASSWORD
sentinel down-after-milliseconds mypan 5000
sentinel parallel-syncs mypan 1
sentinel failover-timeout mypan 10000

# Start Sentinel
redis-sentinel /etc/redis/sentinel.conf
```

### Backup & Restore

```bash
# Automated backup script
#!/bin/bash
# /usr/local/bin/redis-backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/redis"
REDIS_DIR="/var/lib/redis"

# Create backup directory
mkdir -p $BACKUP_DIR

# Trigger Redis save
redis-cli -a YOUR_REDIS_PASSWORD BGSAVE

# Wait for save to complete
while [ $(redis-cli -a YOUR_REDIS_PASSWORD LASTSAVE) -eq $(redis-cli -a YOUR_REDIS_PASSWORD LASTSAVE) ]; do
  sleep 1
done

# Copy dump file
cp $REDIS_DIR/dump.rdb $BACKUP_DIR/dump_$DATE.rdb

# Compress
gzip $BACKUP_DIR/dump_$DATE.rdb

# Upload to S3 (optional)
aws s3 cp $BACKUP_DIR/dump_$DATE.rdb.gz s3://your-bucket/redis-backups/

# Cleanup old backups (keep last 7 days)
find $BACKUP_DIR -name "dump_*.rdb.gz" -mtime +7 -delete

# Schedule with cron
# 0 2 * * * /usr/local/bin/redis-backup.sh
```

---

## API Server Deployment

### Build & Deploy

```bash
# Clone repository
git clone https://github.com/yourusername/pan-api.git
cd pan-api

# Build Go binary
cd api-server
go build -o pan-server -ldflags="-s -w" ./cmd/server

# Create deployment directory
sudo mkdir -p /opt/pan-api
sudo cp pan-server /opt/pan-api/
sudo cp config.yaml /opt/pan-api/
```

### Configuration

```yaml
# /opt/pan-api/config.yaml

server:
  port: 8080
  host: 0.0.0.0
  read_timeout: 30s
  write_timeout: 30s
  shutdown_timeout: 10s

redis:
  host: localhost
  port: 6379
  password: ${REDIS_PASSWORD}
  db: 0
  max_retries: 3
  pool_size: 100
  min_idle_conns: 10

session:
  ttl: 86400  # 24 hours
  max_concurrent: 5  # Max sessions per user

nonce:
  ttl: 300  # 5 minutes
  length: 32

security:
  signature_algorithm: ECDSA
  curve: P-256
  hash: SHA-256

cors:
  allowed_origins:
    - https://example.com
    - https://www.example.com
  allowed_methods:
    - GET
    - POST
    - PUT
    - DELETE
    - OPTIONS
  allowed_headers:
    - Content-Type
    - X-Session-ID
    - X-Signature
    - X-Interaction-Proof
  max_age: 3600

rate_limiting:
  enabled: true
  login_attempts: 5
  login_window: 900  # 15 minutes
  api_requests: 100
  api_window: 60  # 1 minute

logging:
  level: info
  format: json
  output: /var/log/pan-api/app.log
```

### Environment Variables

```bash
# /opt/pan-api/.env

# Redis
REDIS_PASSWORD=your_strong_redis_password

# JWT (if using for additional auth)
JWT_SECRET=your_jwt_secret_key

# Environment
ENVIRONMENT=production
```

### Systemd Service

```ini
# /etc/systemd/system/pan-api.service

[Unit]
Description=PAN API Server
After=network.target redis-server.service
Requires=redis-server.service

[Service]
Type=simple
User=pan
Group=pan
WorkingDirectory=/opt/pan-api
EnvironmentFile=/opt/pan-api/.env
ExecStart=/opt/pan-api/pan-server -config /opt/pan-api/config.yaml
Restart=always
RestartSec=10
StandardOutput=append:/var/log/pan-api/stdout.log
StandardError=append:/var/log/pan-api/stderr.log

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/pan-api

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

```bash
# Create user
sudo useradd -r -s /bin/false pan

# Set permissions
sudo chown -R pan:pan /opt/pan-api
sudo mkdir -p /var/log/pan-api
sudo chown pan:pan /var/log/pan-api

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable pan-api
sudo systemctl start pan-api

# Check status
sudo systemctl status pan-api
```

---

## Frontend Deployment

### Build

```bash
# Main Application
cd main-app
npm install
npm run build

# Output: dist/

# Signing Iframe
cd ../signing-iframe
npm install
npm run build

# Output: dist/
```

### Deploy to Server

```bash
# Create deployment directories
sudo mkdir -p /var/www/pan/main-app
sudo mkdir -p /var/www/pan/signing-iframe

# Copy built files
sudo cp -r main-app/dist/* /var/www/pan/main-app/
sudo cp -r signing-iframe/dist/* /var/www/pan/signing-iframe/

# Set permissions
sudo chown -R www-data:www-data /var/www/pan
sudo chmod -R 755 /var/www/pan
```

### CDN Configuration (Optional)

**Using Cloudflare:**

1. Add site to Cloudflare
2. Update DNS to Cloudflare nameservers
3. Enable:
   - SSL/TLS (Full or Strict)
   - Auto Minify (JS, CSS, HTML)
   - Brotli compression
   - HTTP/2
   - Caching (respect cache headers)

**Cache Rules:**
```
Rule 1: Cache static assets
  - Match: *.js, *.css, *.woff2, *.png, *.jpg
  - Cache Level: Standard
  - Edge TTL: 1 year
  - Browser TTL: 1 year

Rule 2: Don't cache API
  - Match: api.example.com/*
  - Cache Level: Bypass

Rule 3: Don't cache signing iframe runtime
  - Match: sign.example.com/signing-iframe.js
  - Cache Level: Standard
  - Edge TTL: 1 hour
```

---

## Security Hardening

### Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# For Redis (if on separate server)
sudo ufw allow from 192.168.1.0/24 to any port 6379
```

### Fail2Ban

```ini
# /etc/fail2ban/jail.local

[pan-api]
enabled = true
port = http,https
filter = pan-api
logpath = /var/log/pan-api/app.log
maxretry = 5
bantime = 3600
findtime = 600

# /etc/fail2ban/filter.d/pan-api.conf
[Definition]
failregex = "signature_verification_failed".*"ip_address":"<HOST>"
ignoreregex =
```

### Automatic Security Updates

```bash
# Install unattended-upgrades
sudo apt-get install unattended-upgrades

# Configure
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## Monitoring & Logging

### Prometheus Metrics

```go
// Add to API server
import "github.com/prometheus/client_golang/prometheus"

var (
    signatureVerifications = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "pan_signature_verifications_total",
            Help: "Total signature verifications",
        },
        []string{"status"},
    )
    
    verificationDuration = prometheus.NewHistogram(
        prometheus.HistogramOpts{
            Name: "pan_verification_duration_seconds",
            Help: "Signature verification duration",
        },
    )
)

// Expose metrics endpoint
http.Handle("/metrics", promhttp.Handler())
```

### Grafana Dashboard

Import dashboard JSON: [link to dashboard]

Key panels:
- Signature verification rate
- Failed verification rate
- API latency (p50, p95, p99)
- Redis connection pool usage
- Active sessions count
- Nonce generation rate

### Log Aggregation (ELK Stack)

```yaml
# filebeat.yml
filebeat.inputs:
  - type: log
    paths:
      - /var/log/pan-api/app.log
    fields:
      service: pan-api
    json.keys_under_root: true

output.elasticsearch:
  hosts: ["localhost:9200"]
  index: "pan-api-%{+yyyy.MM.dd}"
```

---

## Disaster Recovery

### Backup Strategy

1. **Redis Snapshots**: Daily automated backups to S3
2. **Configuration**: Version controlled in Git
3. **Logs**: Retained for 30 days in Elasticsearch

### Recovery Procedures

**Redis Data Loss:**
```bash
# Restore from backup
aws s3 cp s3://your-bucket/redis-backups/dump_latest.rdb.gz .
gunzip dump_latest.rdb.gz
sudo systemctl stop redis-server
sudo cp dump_latest.rdb /var/lib/redis/dump.rdb
sudo chown redis:redis /var/lib/redis/dump.rdb
sudo systemctl start redis-server
```

**Complete System Failure:**
1. Provision new infrastructure
2. Restore Redis from backup
3. Deploy latest application version
4. Update DNS if IP changed
5. Verify health checks

### High Availability

- Multi-region deployment
- Database replication
- Load balancer health checks
- Automatic failover

---

## Performance Tuning

### Linux Kernel Parameters

```bash
# /etc/sysctl.conf

# Increase max open files
fs.file-max = 2097152

# TCP tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1

# Apply changes
sudo sysctl -p
```

### Nginx Tuning

```nginx
# /etc/nginx/nginx.conf

worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # Connection settings
    keepalive_timeout 65;
    keepalive_requests 100;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/css text/javascript application/javascript;
    
    # Buffer sizes
    client_body_buffer_size 128k;
    client_max_body_size 10m;
}
```

---

This deployment guide provides comprehensive production deployment instructions. Adjust based on your specific infrastructure and scale requirements.
