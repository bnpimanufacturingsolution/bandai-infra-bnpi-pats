# Security Features

This document outlines the comprehensive security features implemented in the 1BIS API template.

## 🔒 Security Middleware Stack

### 1. Rate Limiting

The API implements multiple layers of rate limiting to prevent abuse and DDoS attacks:

#### General Rate Limiting

- **Window**: 15 minutes
- **Limit**: 100 requests (production), 1000 requests (development)
- **Scope**: Per IP address
- **Headers**: Includes rate limit information in responses

#### Authentication Rate Limiting

- **Window**: 15 minutes
- **Limit**: 5 requests (production), 50 requests (development)
- **Scope**: Per IP address
- **Behavior**: Skips successful requests, only counts failed attempts

#### Password Reset Rate Limiting

- **Window**: 1 hour
- **Limit**: 3 attempts
- **Scope**: Per IP address
- **Purpose**: Prevents brute force password reset attacks

#### DDoS Protection

- **Window**: 1 minute
- **Limit**: 20 requests
- **Scope**: Per IP address
- **Purpose**: Immediate protection against high-frequency attacks

#### Slow Down Middleware

- **Gradual Delays**: Starts delaying after threshold is reached
- **Progressive**: Increases delay with each additional request
- **Maximum Delay**: 20 seconds (configurable)

### 2. Input Sanitization

#### SQL Injection Protection

- **Pattern Detection**: Identifies common SQL injection patterns
- **Input Validation**: Validates input against known attack patterns
- **Logging**: Logs attempted SQL injection attacks
- **Prisma Integration**: Additional protection through Prisma ORM

#### Input Validation

- **Email Validation**: Normalizes and validates email addresses
- **URL Validation**: Validates and sanitizes URLs
- **Phone Validation**: Sanitizes and validates phone numbers
- **Length Limits**: Enforces maximum input lengths
- **Type Checking**: Ensures input types match expectations

### 3. Security Headers

#### Helmet.js Integration

- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **Strict-Transport-Security**: Enforces HTTPS
- **X-DNS-Prefetch-Control**: Prevents DNS prefetching
- **Referrer-Policy**: Controls referrer information

#### Custom Security Headers

- **X-RateLimit-\***: Rate limiting information
- **X-Request-ID**: Request correlation
- **X-Response-Time**: Performance monitoring

### 4. Request Security

#### Size Limiting

- **Maximum Request Size**: 10MB
- **Maximum Fields**: 1000 fields per request
- **File Upload Limits**: 5MB per file
- **Memory Protection**: Prevents memory exhaustion attacks

#### IP Filtering

- **Blacklist Support**: Block specific IP addresses
- **Whitelist Support**: Allow only specific IP addresses
- **Environment Configuration**: Different rules per environment
- **Logging**: Logs blocked/allowed requests

### 5. Authentication Security

#### JWT Security

- **Secure Cookies**: HTTP-only cookies for token storage
- **Token Validation**: Comprehensive token verification
- **Role-based Access**: Granular permission system
- **Session Management**: Proper session handling

#### Password Security

- **Argon2 Hashing**: Industry-standard password hashing
- **Salt Generation**: Unique salts for each password
- **Strength Validation**: Password complexity requirements
- **Breach Detection**: Integration with breach databases

### 6. Logging and Monitoring

#### Security Event Logging

- **Suspicious Requests**: Logs potentially malicious requests
- **Rate Limit Violations**: Tracks rate limit breaches
- **Authentication Failures**: Monitors failed login attempts
- **Input Violations**: Logs sanitization violations

#### Performance Monitoring

- **Slow Request Detection**: Identifies performance issues
- **Response Time Tracking**: Monitors API performance
- **Error Rate Monitoring**: Tracks error frequencies
- **Resource Usage**: Monitors memory and CPU usage

## 🛡️ Security Configuration

### Environment Variables

```bash
# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# IP Filtering
BLACKLISTED_IPS=192.168.1.100,10.0.0.50
WHITELISTED_IPS=192.168.1.0/24
ENABLE_IP_WHITELIST=false

# Security Headers
HSTS_MAX_AGE=63072000
CSP_ENABLED=true

# Logging
LOG_SECURITY_VIOLATIONS=true
LOG_SLOW_REQUESTS=true
SLOW_REQUEST_THRESHOLD=5000
```

### Configuration Files

- `config/security.ts`: Main security configuration
- `middleware/rateLimiter.ts`: Rate limiting middleware
- `middleware/inputSanitizer.ts`: Input sanitization middleware
- `middleware/security.ts`: Comprehensive security middleware

## 🚀 Usage Examples

### Basic Security Middleware

```typescript
import { securityMiddleware } from "./middleware/security";

// Apply to all routes
app.use(securityMiddleware);
```

### Authentication Security

```typescript
import { authSecurityMiddleware } from "./middleware/security";

// Apply to auth routes
app.use("/api/auth", authSecurityMiddleware);
```

### Custom Rate Limiting

```typescript
import { createRateLimit } from "./middleware/rateLimiter";

const customLimiter = createRateLimit({
	windowMs: 5 * 60 * 1000, // 5 minutes
	max: 10, // 10 requests
	message: "Custom rate limit exceeded",
});

app.use("/api/sensitive", customLimiter);
```

### Input Sanitization

```typescript
import { sanitizeInput } from "./middleware/inputSanitizer";

// Basic sanitization
app.use(
	sanitizeInput({
		allowHtml: false,
		maxLength: 1000,
		logViolations: true,
	}),
);

// HTML content sanitization
app.use(
	"/api/content",
	sanitizeInput({
		allowHtml: true,
		maxLength: 10000,
	}),
);
```

## 🔍 Security Testing

### Rate Limiting Tests

```bash
# Test general rate limiting
for i in {1..110}; do curl -X GET http://localhost:3000/api/template; done

# Test authentication rate limiting
for i in {1..10}; do curl -X POST http://localhost:3000/api/auth/login -d '{"email":"test@example.com","password":"wrong"}'; done
```

### Input Sanitization Tests

```bash
# Test SQL injection protection
curl -X POST http://localhost:3000/api/template \
  -H "Content-Type: application/json" \
  -d '{"name":"\"; DROP TABLE users; --"}'
```

## 📊 Security Monitoring

### Key Metrics to Monitor

1. **Rate Limit Violations**: Track frequency and patterns
2. **Input Sanitization Violations**: Monitor attack attempts
3. **Authentication Failures**: Watch for brute force attempts
4. **Slow Requests**: Identify performance issues
5. **Error Rates**: Monitor overall API health

### Alerting Thresholds

- **Rate Limit Violations**: > 10 per minute
- **Input Violations**: > 5 per minute
- **Authentication Failures**: > 20 per minute
- **Slow Requests**: > 10% of total requests
- **Error Rate**: > 5% of total requests

## 🔧 Troubleshooting

### Common Issues

1. **Rate Limit Too Strict**: Adjust limits in `config/security.ts`
2. **Input Sanitization Too Aggressive**: Modify sanitization options
3. **IP Filtering Issues**: Check IP whitelist/blacklist configuration
4. **Performance Impact**: Monitor middleware execution time

### Debug Mode

Enable debug logging by setting:

```bash
NODE_ENV=development
DEBUG=security:*
```

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [Rate Limiting Strategies](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)

## 🤝 Contributing

When adding new security features:

1. Follow the existing middleware pattern
2. Add comprehensive tests
3. Update this documentation
4. Consider backward compatibility
5. Test in all environments

## 📝 Changelog

### v1.0.0

- Initial security implementation
- Rate limiting middleware
- Input sanitization
- Security headers
- Authentication security
- Comprehensive logging
