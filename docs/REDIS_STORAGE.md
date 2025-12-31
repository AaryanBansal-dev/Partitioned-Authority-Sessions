# Redis Storage Implementation Guide

Detailed guide to the Redis storage layer in the PAN system.

---

## Table of Contents

1. [Overview](#overview)
2. [Data Models](#data-models)
3. [Key Patterns](#key-patterns)
4. [Operations](#operations)
5. [Performance Optimization](#performance-optimization)
6. [Monitoring](#monitoring)
7. [Backup & Recovery](#backup--recovery)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Redis serves as the primary storage backend for the PAN system, handling:

- **Session data**: User sessions with public keys
- **Nonce management**: Single-use tokens for replay attack prevention
- **Rate limiting**: Request counting and throttling
- **Public key registry**: Multi-session key tracking per user
- **Behavioral analytics**: Interaction pattern storage (optional)

### Why Redis?

1. **Speed**: Sub-millisecond latency for session lookups
2. **Atomic Operations**: `GETDEL` prevents nonce reuse race conditions
3. **TTL Support**: Automatic expiration reduces manual cleanup
4. **Data Structures**: Native support for hashes, sets, sorted sets
5. **Persistence**: Snapshotting + AOF for durability
6. **Clustering**: Horizontal scaling when needed

---

## Data Models

### 1. Session Storage

**Structure**: Hash

**Key Pattern**: `session:{session_id}`

**Fields**:
```redis
HSET session:abc123
  user_id "user-456"
  public_key_jwk "{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\"...\",\"y\":\"...\"}"
  created_at "1640000000"
  last_access "1640001000"
  expires_at "1640086400"
  ip_address "192.168.1.1"
  user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  device_id "device-789"
  login_method "password+mfa"
```

**TTL**: 86400 seconds (24 hours)

**Go Implementation**:
```go
type Session struct {
    SessionID    string `redis:"session_id"`
    UserID       string `redis:"user_id"`
    PublicKeyJWK string `redis:"public_key_jwk"`
    CreatedAt    int64  `redis:"created_at"`
    LastAccess   int64  `redis:"last_access"`
    ExpiresAt    int64  `redis:"expires_at"`
    IPAddress    string `redis:"ip_address"`
    UserAgent    string `redis:"user_agent"`
    DeviceID     string `redis:"device_id"`
    LoginMethod  string `redis:"login_method"`
}

func (s *SessionStore) Create(session *Session) error {
    ctx := context.Background()
    key := fmt.Sprintf("session:%s", session.SessionID)
    
    pipe := s.client.Pipeline()
    
    // Set all fields
    pipe.HSet(ctx, key, map[string]interface{}{
        "user_id":        session.UserID,
        "public_key_jwk": session.PublicKeyJWK,
        "created_at":     session.CreatedAt,
        "last_access":    session.LastAccess,
        "expires_at":     session.ExpiresAt,
        "ip_address":     session.IPAddress,
        "user_agent":     session.UserAgent,
        "device_id":      session.DeviceID,
        "login_method":   session.LoginMethod,
    })
    
    // Set TTL
    pipe.Expire(ctx, key, SessionTTL)
    
    _, err := pipe.Exec(ctx)
    return err
}

func (s *SessionStore) Get(sessionID string) (*Session, error) {
    ctx := context.Background()
    key := fmt.Sprintf("session:%s", sessionID)
    
    result, err := s.client.HGetAll(ctx, key).Result()
    if err != nil {
        return nil, err
    }
    
    if len(result) == 0 {
        return nil, ErrSessionNotFound
    }
    
    session := &Session{
        SessionID:    sessionID,
        UserID:       result["user_id"],
        PublicKeyJWK: result["public_key_jwk"],
        IPAddress:    result["ip_address"],
        UserAgent:    result["user_agent"],
        DeviceID:     result["device_id"],
        LoginMethod:  result["login_method"],
    }
    
    // Parse timestamps
    session.CreatedAt, _ = strconv.ParseInt(result["created_at"], 10, 64)
    session.LastAccess, _ = strconv.ParseInt(result["last_access"], 10, 64)
    session.ExpiresAt, _ = strconv.ParseInt(result["expires_at"], 10, 64)
    
    return session, nil
}

func (s *SessionStore) UpdateLastAccess(sessionID string) error {
    ctx := context.Background()
    key := fmt.Sprintf("session:%s", sessionID)
    
    now := time.Now().Unix()
    
    pipe := s.client.Pipeline()
    pipe.HSet(ctx, key, "last_access", now)
    pipe.Expire(ctx, key, SessionTTL) // Reset TTL
    
    _, err := pipe.Exec(ctx)
    return err
}
```

### 2. Nonce Management

**Structure**: String

**Key Pattern**: `nonce:{nonce_value}`

**Value**: `"1"` (simple flag)

**TTL**: 300 seconds (5 minutes)

**Critical Feature**: Atomic consumption via `GETDEL`

**Go Implementation**:
```go
type NonceManager struct {
    client *redis.Client
}

func (nm *NonceManager) Generate() (string, error) {
    // Generate cryptographically random nonce
    nonceBytes := make([]byte, 32)
    if _, err := rand.Read(nonceBytes); err != nil {
        return "", err
    }
    
    nonce := base64.StdEncoding.EncodeToString(nonceBytes)
    
    // Store in Redis
    ctx := context.Background()
    key := fmt.Sprintf("nonce:%s", nonce)
    
    err := nm.client.Set(ctx, key, "1", NonceTTL).Err()
    if err != nil {
        return "", err
    }
    
    return nonce, nil
}

func (nm *NonceManager) ValidateAndConsume(nonce string) (bool, error) {
    ctx := context.Background()
    key := fmt.Sprintf("nonce:%s", nonce)
    
    // Atomic get-and-delete
    // If nonce exists, returns "1" and deletes it
    // If nonce doesn't exist, returns error
    result, err := nm.client.GetDel(ctx, key).Result()
    
    if err == redis.Nil {
        // Nonce doesn't exist or already used
        return false, nil
    }
    
    if err != nil {
        return false, err
    }
    
    return result == "1", nil
}
```

**Why GETDEL is Critical**:
```
# Without atomic operation (VULNERABLE):
Time  Thread A              Thread B
----  --------              --------
T1    GET nonce:xyz         
T2                          GET nonce:xyz
T3    (found: "1")          (found: "1")
T4    DEL nonce:xyz         
T5                          DEL nonce:xyz
T6    [accepts request]     [accepts request]  ← REPLAY ATTACK!

# With GETDEL (SECURE):
Time  Thread A              Thread B
----  --------              --------
T1    GETDEL nonce:xyz      
T2    (returns "1")         
T3                          GETDEL nonce:xyz
T4                          (returns nil)
T5    [accepts request]     [rejects request]  ✓ Safe
```

### 3. Rate Limiting

**Structure**: Sorted Set

**Key Pattern**: `ratelimit:{entity_type}:{entity_id}`

**Members**: Request IDs (UUIDs)

**Scores**: Unix timestamps

**Go Implementation**:
```go
type RateLimiter struct {
    client *redis.Client
}

func (rl *RateLimiter) CheckLimit(entityType, entityID string, limit int, window time.Duration) (bool, error) {
    ctx := context.Background()
    key := fmt.Sprintf("ratelimit:%s:%s", entityType, entityID)
    
    now := time.Now().Unix()
    windowStart := now - int64(window.Seconds())
    
    pipe := rl.client.Pipeline()
    
    // Remove old entries outside the window
    pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart))
    
    // Count requests in current window
    countCmd := pipe.ZCount(ctx, key, fmt.Sprintf("%d", windowStart), "+inf")
    
    // Add current request
    requestID := uuid.New().String()
    pipe.ZAdd(ctx, key, redis.Z{
        Score:  float64(now),
        Member: requestID,
    })
    
    // Set expiration
    pipe.Expire(ctx, key, window)
    
    _, err := pipe.Exec(ctx)
    if err != nil {
        return false, err
    }
    
    count := countCmd.Val()
    
    // Check if within limit
    return count < int64(limit), nil
}

// Example usage
allowed, err := rateLimiter.CheckLimit("session", "abc123", 100, time.Minute)
if !allowed {
    return ErrRateLimitExceeded
}
```

**Rate Limit Examples**:

```redis
# Check requests in last minute for session abc123
ZCOUNT ratelimit:session:abc123 1640000000 +inf

# Add new request
ZADD ratelimit:session:abc123 1640000060 "req-uuid-123"

# Cleanup old requests (older than 1 minute ago)
ZREMRANGEBYSCORE ratelimit:session:abc123 0 1639999960

# Get all requests in window
ZRANGE ratelimit:session:abc123 0 -1 WITHSCORES
```

### 4. Public Key Registry

**Structure**: Hash

**Key Pattern**: `pubkeys:{user_id}`

**Fields**: `{session_id}: {public_key_jwk}`

**Purpose**: Track all active sessions for a user

**Go Implementation**:
```go
type PublicKeyRegistry struct {
    client *redis.Client
}

func (pkr *PublicKeyRegistry) AddKey(userID, sessionID, publicKeyJWK string) error {
    ctx := context.Background()
    key := fmt.Sprintf("pubkeys:%s", userID)
    
    return pkr.client.HSet(ctx, key, sessionID, publicKeyJWK).Err()
}

func (pkr *PublicKeyRegistry) GetKey(userID, sessionID string) (string, error) {
    ctx := context.Background()
    key := fmt.Sprintf("pubkeys:%s", userID)
    
    result, err := pkr.client.HGet(ctx, key, sessionID).Result()
    if err == redis.Nil {
        return "", ErrPublicKeyNotFound
    }
    
    return result, err
}

func (pkr *PublicKeyRegistry) ListSessions(userID string) ([]string, error) {
    ctx := context.Background()
    key := fmt.Sprintf("pubkeys:%s", userID)
    
    sessionIDs, err := pkr.client.HKeys(ctx, key).Result()
    if err != nil {
        return nil, err
    }
    
    return sessionIDs, nil
}

func (pkr *PublicKeyRegistry) RemoveKey(userID, sessionID string) error {
    ctx := context.Background()
    key := fmt.Sprintf("pubkeys:%s", userID)
    
    return pkr.client.HDel(ctx, key, sessionID).Err()
}

// Enforce max concurrent sessions
func (pkr *PublicKeyRegistry) EnforceMaxSessions(userID string, maxSessions int) error {
    sessions, err := pkr.ListSessions(userID)
    if err != nil {
        return err
    }
    
    if len(sessions) >= maxSessions {
        // Remove oldest session
        // (Need to fetch session metadata to determine oldest)
        oldestSessionID := sessions[0] // Simplified
        
        // Delete oldest session
        if err := pkr.RemoveKey(userID, oldestSessionID); err != nil {
            return err
        }
        
        // Also delete session data
        sessionKey := fmt.Sprintf("session:%s", oldestSessionID)
        return pkr.client.Del(context.Background(), sessionKey).Err()
    }
    
    return nil
}
```

### 5. Interaction Pattern Storage (Optional)

**Structure**: List

**Key Pattern**: `interactions:{session_id}`

**Purpose**: Store interaction history for anomaly detection

**Go Implementation**:
```go
type InteractionStore struct {
    client *redis.Client
}

type InteractionRecord struct {
    Timestamp   int64   `json:"timestamp"`
    Type        string  `json:"type"`
    TargetHash  string  `json:"target_hash"`
    Velocity    float64 `json:"velocity"`
    Trajectory  string  `json:"trajectory"` // Compressed
}

func (is *InteractionStore) Record(sessionID string, interaction *InteractionRecord) error {
    ctx := context.Background()
    key := fmt.Sprintf("interactions:%s", sessionID)
    
    // Serialize to JSON
    data, err := json.Marshal(interaction)
    if err != nil {
        return err
    }
    
    pipe := is.client.Pipeline()
    
    // Add to list
    pipe.LPush(ctx, key, data)
    
    // Keep only last 100 interactions
    pipe.LTrim(ctx, key, 0, 99)
    
    // Set TTL
    pipe.Expire(ctx, key, SessionTTL)
    
    _, err = pipe.Exec(ctx)
    return err
}

func (is *InteractionStore) GetRecent(sessionID string, count int) ([]*InteractionRecord, error) {
    ctx := context.Background()
    key := fmt.Sprintf("interactions:%s", sessionID)
    
    results, err := is.client.LRange(ctx, key, 0, int64(count-1)).Result()
    if err != nil {
        return nil, err
    }
    
    interactions := make([]*InteractionRecord, 0, len(results))
    for _, data := range results {
        var interaction InteractionRecord
        if err := json.Unmarshal([]byte(data), &interaction); err != nil {
            continue
        }
        interactions = append(interactions, &interaction)
    }
    
    return interactions, nil
}
```

---

## Key Patterns

### Naming Convention

```
{entity_type}:{identifier}[:{sub_identifier}]
```

**Examples**:
- `session:abc123`
- `nonce:xyz789`
- `ratelimit:session:abc123`
- `pubkeys:user-456`
- `interactions:abc123`

### Namespace Separation

```
pan:        # Production
pan:dev:    # Development
pan:test:   # Testing
```

**Implementation**:
```go
type RedisConfig struct {
    Prefix string // e.g., "pan:" or "pan:dev:"
}

func (s *SessionStore) makeKey(parts ...string) string {
    return s.config.Prefix + strings.Join(parts, ":")
}

// Usage
key := s.makeKey("session", sessionID)  // "pan:session:abc123"
```

---

## Operations

### Connection Management

```go
import "github.com/go-redis/redis/v8"

type RedisClient struct {
    client *redis.Client
}

func NewRedisClient(config *RedisConfig) (*RedisClient, error) {
    client := redis.NewClient(&redis.Options{
        Addr:         config.Addr,
        Password:     config.Password,
        DB:           config.DB,
        MaxRetries:   3,
        PoolSize:     100,
        MinIdleConns: 10,
        DialTimeout:  5 * time.Second,
        ReadTimeout:  3 * time.Second,
        WriteTimeout: 3 * time.Second,
        PoolTimeout:  4 * time.Second,
    })
    
    // Test connection
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    if err := client.Ping(ctx).Err(); err != nil {
        return nil, fmt.Errorf("redis connection failed: %w", err)
    }
    
    return &RedisClient{client: client}, nil
}
```

### Pipeline Usage

**Use pipelines to batch multiple commands**:

```go
func (s *SessionStore) CreateWithTracking(session *Session) error {
    ctx := context.Background()
    
    pipe := s.client.Pipeline()
    
    // 1. Store session
    sessionKey := fmt.Sprintf("session:%s", session.SessionID)
    pipe.HSet(ctx, sessionKey, session)
    pipe.Expire(ctx, sessionKey, SessionTTL)
    
    // 2. Add to public key registry
    pubkeyKey := fmt.Sprintf("pubkeys:%s", session.UserID)
    pipe.HSet(ctx, pubkeyKey, session.SessionID, session.PublicKeyJWK)
    
    // 3. Initialize rate limiting
    rateLimitKey := fmt.Sprintf("ratelimit:session:%s", session.SessionID)
    pipe.Expire(ctx, rateLimitKey, time.Hour)
    
    // Execute all commands atomically
    _, err := pipe.Exec(ctx)
    return err
}
```

### Transaction Example

```go
func (s *SessionStore) TransferSession(oldSessionID, newSessionID, userID string) error {
    ctx := context.Background()
    
    err := s.client.Watch(ctx, func(tx *redis.Tx) error {
        // Get old session
        oldKey := fmt.Sprintf("session:%s", oldSessionID)
        session, err := tx.HGetAll(ctx, oldKey).Result()
        if err != nil {
            return err
        }
        
        // Create new session
        _, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
            newKey := fmt.Sprintf("session:%s", newSessionID)
            
            // Copy to new key
            pipe.HSet(ctx, newKey, session)
            pipe.Expire(ctx, newKey, SessionTTL)
            
            // Delete old key
            pipe.Del(ctx, oldKey)
            
            // Update public key registry
            pubkeyKey := fmt.Sprintf("pubkeys:%s", userID)
            pipe.HDel(ctx, pubkeyKey, oldSessionID)
            pipe.HSet(ctx, pubkeyKey, newSessionID, session["public_key_jwk"])
            
            return nil
        })
        
        return err
    }, oldKey)
    
    return err
}
```

---

## Performance Optimization

### Connection Pooling

```go
client := redis.NewClient(&redis.Options{
    PoolSize:     100,  // Max connections
    MinIdleConns: 10,   // Keep warm connections
    MaxConnAge:   time.Hour,
    PoolTimeout:  4 * time.Second,
})
```

### Batch Reads

```go
func (s *SessionStore) GetMultiple(sessionIDs []string) ([]*Session, error) {
    ctx := context.Background()
    
    pipe := s.client.Pipeline()
    
    cmds := make([]*redis.StringStringMapCmd, len(sessionIDs))
    for i, id := range sessionIDs {
        key := fmt.Sprintf("session:%s", id)
        cmds[i] = pipe.HGetAll(ctx, key)
    }
    
    _, err := pipe.Exec(ctx)
    if err != nil {
        return nil, err
    }
    
    sessions := make([]*Session, 0, len(sessionIDs))
    for i, cmd := range cmds {
        result, err := cmd.Result()
        if err != nil || len(result) == 0 {
            continue
        }
        
        session := parseSession(sessionIDs[i], result)
        sessions = append(sessions, session)
    }
    
    return sessions, nil
}
```

### Compression (for large values)

```go
import "github.com/klauspost/compress/zstd"

func compress(data []byte) ([]byte, error) {
    encoder, _ := zstd.NewWriter(nil)
    return encoder.EncodeAll(data, nil), nil
}

func decompress(data []byte) ([]byte, error) {
    decoder, _ := zstd.NewReader(nil)
    return decoder.DecodeAll(data, nil)
}

// Use for trajectory data
compressed, _ := compress([]byte(trajectoryJSON))
client.HSet(ctx, key, "trajectory", compressed)
```

---

## Monitoring

### Key Metrics

```go
import "github.com/prometheus/client_golang/prometheus"

var (
    redisOps = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "redis_operations_total",
            Help: "Total Redis operations",
        },
        []string{"operation", "status"},
    )
    
    redisLatency = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name: "redis_operation_duration_seconds",
            Help: "Redis operation latency",
        },
        []string{"operation"},
    )
)

func (s *SessionStore) Get(sessionID string) (*Session, error) {
    start := time.Now()
    defer func() {
        redisLatency.WithLabelValues("get_session").Observe(time.Since(start).Seconds())
    }()
    
    session, err := s.getInternal(sessionID)
    
    status := "success"
    if err != nil {
        status = "error"
    }
    redisOps.WithLabelValues("get_session", status).Inc()
    
    return session, err
}
```

### Health Checks

```go
func (r *RedisClient) HealthCheck() error {
    ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
    defer cancel()
    
    // Test basic operation
    if err := r.client.Ping(ctx).Err(); err != nil {
        return fmt.Errorf("redis ping failed: %w", err)
    }
    
    // Test read/write
    testKey := "healthcheck:test"
    if err := r.client.Set(ctx, testKey, "1", time.Second).Err(); err != nil {
        return fmt.Errorf("redis write failed: %w", err)
    }
    
    if err := r.client.Get(ctx, testKey).Err(); err != nil {
        return fmt.Errorf("redis read failed: %w", err)
    }
    
    return nil
}
```

---

## Backup & Recovery

### Manual Backup

```bash
# Trigger save
redis-cli -a PASSWORD BGSAVE

# Wait for completion
redis-cli -a PASSWORD LASTSAVE

# Copy dump file
cp /var/lib/redis/dump.rdb /backup/dump_$(date +%Y%m%d).rdb
```

### Automated Backup Script

See DEPLOYMENT.md for complete backup automation.

### Point-in-Time Recovery

```bash
# Stop Redis
sudo systemctl stop redis-server

# Restore dump
cp /backup/dump_20231225.rdb /var/lib/redis/dump.rdb
chown redis:redis /var/lib/redis/dump.rdb

# Start Redis
sudo systemctl start redis-server
```

---

## Troubleshooting

### Common Issues

#### 1. Connection Timeout

**Symptom**: `dial tcp: i/o timeout`

**Solutions**:
```bash
# Check Redis is running
sudo systemctl status redis-server

# Check firewall
sudo ufw status

# Test connection
redis-cli -h localhost -p 6379 ping
```

#### 2. Memory Issues

**Symptom**: `OOM command not allowed when used memory > 'maxmemory'`

**Solutions**:
```conf
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
```

#### 3. Slow Queries

**Diagnose**:
```bash
# Enable slow log
CONFIG SET slowlog-log-slower-than 10000  # 10ms

# View slow queries
SLOWLOG GET 10
```

**Common causes**:
- Large key retrieval (`HGETALL` on huge hashes)
- `KEYS *` pattern (use `SCAN` instead)
- Unoptimized Lua scripts

---

This guide provides comprehensive coverage of Redis storage implementation in the PAN system.
