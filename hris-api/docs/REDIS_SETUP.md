# Redis Setup Guide

This guide explains how to use Redis caching in your MSA Template application.

## Overview

Redis has been integrated into the template to provide:

- **Caching**: Speed up API responses by caching frequently accessed data
- **Session Management**: Store user sessions with automatic expiration
- **Rate Limiting**: Implement request rate limiting per user/IP
- **Pub/Sub**: Real-time messaging between different parts of your application
- **Data Storage**: Temporary data storage with TTL (Time To Live)

## Configuration

### Environment Variables

Add these Redis configuration variables to your `.env` file:

```env
# Redis Configuration
REDIS_URL=redis://:template@localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=template
REDIS_DB=0
REDIS_ENABLED=true
```

### Docker Setup

Redis is automatically configured in `docker-compose.yml`:

```yaml
redis:
    image: redis:7.2-alpine
    container_name: template-redis
    ports:
        - "6379:6379"
    volumes:
        - redisdata:/data
    command: ["redis-server", "--appendonly", "yes", "--requirepass", "template"]
```

## Usage Examples

### 1. Basic Caching Middleware

Use the built-in caching middleware for automatic response caching:

```typescript
import { cache, cacheShort, cacheMedium, cacheUser } from "../middleware/cache";

// Cache for 5 minutes
router.get("/api/data", cacheShort, (req, res) => {
	// Your expensive operation here
	res.json({ data: "expensive data" });
});

// User-specific caching
router.get("/api/user/dashboard", cacheUser, (req, res) => {
	// User-specific data that should be cached per user
	res.json({ dashboard: "user dashboard data" });
});
```

### 2. Direct Redis Operations

For more control, use Redis directly:

```typescript
import { redisClient } from "../config/redis";

// Store data
await redisClient.setJSON("user:123", userData, 3600); // Cache for 1 hour

// Retrieve data
const userData = await redisClient.getJSON("user:123");

// Check if key exists
const exists = await redisClient.exists("user:123");

// Delete data
await redisClient.del("user:123");
```

### 3. Cache Invalidation

Invalidate cache when data changes:

```typescript
import { invalidateCache } from "../middleware/cache";

// After updating user data
await invalidateCache.byUser(userId);

// After updating public data
await invalidateCache.public();

// Clear all cache
await invalidateCache.all();
```

### 4. Session Management

Store user sessions in Redis:

```typescript
import { exampleSessionManagement } from "../utils/redisExample";

// Create session
const sessionId = await exampleSessionManagement.createSession(userId, sessionData);

// Get session
const session = await exampleSessionManagement.getSession(sessionId);

// Delete session
await exampleSessionManagement.deleteSession(sessionId);
```

### 5. Rate Limiting

Implement rate limiting:

```typescript
import { exampleRateLimiting } from "../utils/redisExample";

const rateLimit = await exampleRateLimiting.checkRateLimit(
	req.ip, // identifier
	100, // max requests
	3600, // window in seconds
);

if (!rateLimit.allowed) {
	return res.status(429).json({
		error: "Rate limit exceeded",
		resetTime: rateLimit.resetTime,
	});
}
```

## Available Cache Types

### Middleware Options

- `cache()` - Default cache (1 hour TTL)
- `cacheShort` - Short cache (5 minutes TTL)
- `cacheMedium` - Medium cache (30 minutes TTL)
- `cacheLong` - Long cache (2 hours TTL)
- `cacheUser` - User-specific cache
- `cachePublic` - Public cache (no user data)

### Custom Cache Options

```typescript
const customCache = cache({
	ttl: 1800, // 30 minutes
	keyGenerator: (req) => `custom:${req.params.id}:${req.query.type}`,
	skipCache: (req) => req.headers["x-no-cache"] === "true",
	onHit: (key, data) => console.log(`Cache hit: ${key}`),
	onMiss: (key) => console.log(`Cache miss: ${key}`),
	onError: (error) => console.error("Cache error:", error),
});
```

## Redis Data Types

The Redis client supports all major Redis data types:

### Strings

```typescript
await redisClient.set("key", "value", 3600);
const value = await redisClient.get("key");
```

### JSON Objects

```typescript
await redisClient.setJSON("user:123", { name: "John", age: 30 });
const user = await redisClient.getJSON("user:123");
```

### Hashes

```typescript
await redisClient.hset("user:123:settings", "theme", "dark");
const theme = await redisClient.hget("user:123:settings", "theme");
```

### Lists

```typescript
await redisClient.lpush("notifications:123", "New message");
const notifications = await redisClient.lrange("notifications:123", 0, -1);
```

### Sets

```typescript
await redisClient.sadd("user:123:tags", "premium");
const tags = await redisClient.smembers("user:123:tags");
```

## Monitoring and Health Checks

### Redis Health Check

A health check endpoint is available at `/health/redis`:

```typescript
GET /health/redis

Response:
{
  "success": true,
  "redis": {
    "connected": true,
    "latency": "2ms",
    "memoryUsage": "1.5M",
    "totalKeys": 1234
  }
}
```

### Cache Statistics

Get cache statistics:

```typescript
import { cacheManager } from "../middleware/cache";

const stats = await cacheManager.getStats();
console.log(stats);
// { totalKeys: 1234, memoryUsage: "1.5M" }
```

## Best Practices

### 1. Cache Key Naming

Use consistent, hierarchical key naming:

- `user:{userId}:profile`
- `public:products:category:{categoryId}`
- `session:{sessionId}`

### 2. TTL Strategy

- **Short TTL (5 minutes)**: Frequently changing data
- **Medium TTL (30 minutes)**: Semi-static data
- **Long TTL (2+ hours)**: Rarely changing data

### 3. Cache Invalidation

- Invalidate cache when underlying data changes
- Use pattern-based invalidation for related data
- Consider cache warming for critical data

### 4. Error Handling

- Always handle Redis connection failures gracefully
- Application should work without Redis (degraded performance)
- Log cache errors for monitoring

### 5. Memory Management

- Monitor Redis memory usage
- Set appropriate TTL values
- Use Redis eviction policies (allkeys-lru recommended)

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**

    - Check if Redis service is running
    - Verify connection parameters
    - Check network connectivity

2. **High Memory Usage**

    - Review TTL settings
    - Check for keys without expiration
    - Monitor key patterns

3. **Cache Miss Rate Too High**
    - Review cache key generation
    - Check TTL values
    - Verify cache invalidation logic

### Debugging

Enable Redis debugging:

```typescript
// Set log level to debug in your logger configuration
logger.level = "debug";

// Monitor Redis operations
redisClient.getClient().monitor((time, args) => {
	console.log(`${time}: ${args.join(" ")}`);
});
```

## Performance Tips

1. **Use Pipelining** for multiple operations
2. **Implement connection pooling** for high-traffic applications
3. **Use Redis Cluster** for horizontal scaling
4. **Monitor key distribution** to avoid hot spots
5. **Implement circuit breaker** pattern for Redis failures

## Security Considerations

1. **Use Redis AUTH** (password protection)
2. **Disable dangerous commands** in production
3. **Use SSL/TLS** for Redis connections
4. **Implement proper access controls**
5. **Regular security updates** for Redis

## Example Integration

See `utils/redisExample.ts` for comprehensive usage examples including:

- Direct Redis operations
- Caching strategies
- Session management
- Rate limiting
- Pub/Sub messaging
- Health checks
- Cache invalidation patterns

## Production Deployment

For production deployments:

1. Use Redis Sentinel for high availability
2. Enable Redis persistence (AOF + RDB)
3. Set up monitoring and alerting
4. Configure memory limits and eviction policies
5. Use Redis Cluster for scaling
6. Implement backup strategies
