import { Request, Response } from "express";
import { redisClient } from "../config/redis";
import { cache, cacheShort, cacheMedium, cacheUser, invalidateCache } from "../middleware/cache";
import { getLogger } from "../helper/logger.helper";
import { AuthRequest } from "../middleware/verifyToken";

const logger = getLogger();

/**
 * Example Redis Usage in Controllers
 *
 * This file demonstrates various ways to use Redis in your application:
 * 1. Direct Redis operations
 * 2. Caching middleware
 * 3. Session management
 * 4. Rate limiting data
 * 5. Cache invalidation strategies
 */

// Example 1: Direct Redis operations in a controller
export const exampleDirectRedisUsage = async (req: Request, res: Response) => {
	try {
		const userId = (req as AuthRequest).userId || "anonymous";
		const cacheKey = `user_profile:${userId}`;

		// Try to get from cache first
		let userProfile = await redisClient.getJSON(cacheKey);

		if (!userProfile) {
			// Simulate database query
			userProfile = {
				id: userId,
				name: "John Doe",
				email: "john@example.com",
				preferences: {
					theme: "dark",
					language: "en",
				},
				lastLogin: new Date().toISOString(),
			};

			// Cache for 1 hour
			await redisClient.setJSON(cacheKey, userProfile, 3600);
			logger.info(`User profile cached for user: ${userId}`);
		}

		res.json({
			success: true,
			data: userProfile,
			cached: !!userProfile,
		});
	} catch (error) {
		logger.error("Error in example direct Redis usage:", error);
		res.status(500).json({
			success: false,
			error: "Internal server error",
		});
	}
};

// Example 2: Using caching middleware
export const exampleCachedEndpoint = [
	// Cache for 5 minutes
	cacheShort,
	async (req: Request, res: Response) => {
		try {
			// Simulate expensive operation
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const data = {
				timestamp: new Date().toISOString(),
				randomData: Math.random(),
				expensiveCalculation: Array.from({ length: 1000 }, (_, i) => i * i),
			};

			res.json({
				success: true,
				data,
				message: "This response is cached for 5 minutes",
			});
		} catch (error) {
			logger.error("Error in cached endpoint:", error);
			res.status(500).json({
				success: false,
				error: "Internal server error",
			});
		}
	},
];

// Example 3: User-specific caching
export const exampleUserSpecificCache = [
	cacheUser,
	async (req: Request, res: Response) => {
		try {
			const userId = (req as AuthRequest).userId;

			// Simulate user-specific data query
			const userData = {
				userId,
				dashboard: {
					totalOrders: Math.floor(Math.random() * 100),
					totalSpent: Math.floor(Math.random() * 10000),
					recentActivity: Array.from({ length: 5 }, (_, i) => ({
						id: i + 1,
						action: `Action ${i + 1}`,
						timestamp: new Date(Date.now() - i * 86400000).toISOString(),
					})),
				},
				timestamp: new Date().toISOString(),
			};

			res.json({
				success: true,
				data: userData,
				message: "This response is cached per user",
			});
		} catch (error) {
			logger.error("Error in user-specific cache:", error);
			res.status(500).json({
				success: false,
				error: "Internal server error",
			});
		}
	},
];

// Example 4: Session management with Redis
export const exampleSessionManagement = {
	// Store session data
	createSession: async (userId: string, sessionData: any) => {
		try {
			const sessionId = `session:${userId}:${Date.now()}`;
			await redisClient.setJSON(sessionId, sessionData, 86400); // 24 hours
			logger.info(`Session created: ${sessionId}`);
			return sessionId;
		} catch (error) {
			logger.error("Error creating session:", error);
			throw error;
		}
	},

	// Get session data
	getSession: async (sessionId: string) => {
		try {
			const sessionData = await redisClient.getJSON(sessionId);
			if (sessionData) {
				// Extend session TTL on access
				await redisClient.expire(sessionId, 86400);
			}
			return sessionData;
		} catch (error) {
			logger.error("Error getting session:", error);
			throw error;
		}
	},

	// Delete session
	deleteSession: async (sessionId: string) => {
		try {
			await redisClient.del(sessionId);
			logger.info(`Session deleted: ${sessionId}`);
		} catch (error) {
			logger.error("Error deleting session:", error);
			throw error;
		}
	},
};

// Example 5: Rate limiting with Redis
export const exampleRateLimiting = {
	// Simple rate limiting
	checkRateLimit: async (
		identifier: string,
		maxRequests: number = 100,
		windowSeconds: number = 3600,
	) => {
		try {
			const key = `rate_limit:${identifier}`;
			const current = await redisClient.get(key);

			if (!current) {
				// First request in window
				await redisClient.set(key, "1", windowSeconds);
				return {
					allowed: true,
					remaining: maxRequests - 1,
					resetTime: Date.now() + windowSeconds * 1000,
				};
			}

			const count = parseInt(current);
			if (count >= maxRequests) {
				const ttl = await redisClient.ttl(key);
				return {
					allowed: false,
					remaining: 0,
					resetTime: Date.now() + ttl * 1000,
				};
			}

			// Increment counter
			const newCount = await redisClient.incr(key);
			return {
				allowed: true,
				remaining: maxRequests - newCount,
				resetTime: Date.now() + (await redisClient.ttl(key)) * 1000,
			};
		} catch (error) {
			logger.error("Error checking rate limit:", error);
			// Allow request on Redis error
			return {
				allowed: true,
				remaining: maxRequests,
				resetTime: Date.now() + windowSeconds * 1000,
			};
		}
	},
};

// Example 6: Cache invalidation strategies
export const exampleCacheInvalidation = {
	// Invalidate user-specific cache when user data changes
	invalidateUserCache: async (req: Request, res: Response) => {
		try {
			const userId = req.params.userId;

			// Simulate user data update
			// ... update user in database ...

			// Invalidate all user-specific cache
			await invalidateCache.byUser(userId);

			res.json({
				success: true,
				message: `Cache invalidated for user: ${userId}`,
			});
		} catch (error) {
			logger.error("Error invalidating user cache:", error);
			res.status(500).json({
				success: false,
				error: "Internal server error",
			});
		}
	},

	// Invalidate specific cache pattern
	invalidatePatternCache: async (req: Request, res: Response) => {
		try {
			const pattern = req.body.pattern || "public:*";
			const invalidatedCount = await invalidateCache.byPattern(pattern);

			res.json({
				success: true,
				message: `Invalidated ${invalidatedCount} cache entries`,
				pattern,
			});
		} catch (error) {
			logger.error("Error invalidating pattern cache:", error);
			res.status(500).json({
				success: false,
				error: "Internal server error",
			});
		}
	},

	// Clear all cache
	clearAllCache: async (req: Request, res: Response) => {
		try {
			await invalidateCache.all();

			res.json({
				success: true,
				message: "All cache cleared",
			});
		} catch (error) {
			logger.error("Error clearing all cache:", error);
			res.status(500).json({
				success: false,
				error: "Internal server error",
			});
		}
	},
};

// Example 7: Redis pub/sub for real-time features
export const examplePubSub = {
	// Publisher
	publishMessage: async (channel: string, message: any) => {
		try {
			const client = redisClient.getClient();
			const messageString = JSON.stringify(message);
			await client.publish(channel, messageString);
			logger.info(`Message published to channel ${channel}`);
		} catch (error) {
			logger.error("Error publishing message:", error);
			throw error;
		}
	},

	// Subscriber (typically set up during app initialization)
	setupSubscriber: () => {
		try {
			const client = redisClient.getClient();
			const subscriber = client.duplicate();

			subscriber.on("message", (channel: string, message: string) => {
				try {
					const parsedMessage = JSON.parse(message);
					logger.info(`Received message on channel ${channel}:`, parsedMessage);

					// Handle message based on channel
					switch (channel) {
						case "user_updates":
							// Handle user updates
							break;
						case "notifications":
							// Handle notifications
							break;
						default:
							logger.warn(`Unknown channel: ${channel}`);
					}
				} catch (error) {
					logger.error("Error processing pub/sub message:", error);
				}
			});

			subscriber.subscribe("user_updates", "notifications");
			logger.info("Redis pub/sub subscriber set up");
		} catch (error) {
			logger.error("Error setting up Redis subscriber:", error);
		}
	},
};

// Example 8: Redis health check
export const redisHealthCheck = async (req: Request, res: Response) => {
	try {
		const start = Date.now();
		await redisClient.ping();
		const latency = Date.now() - start;

		const stats = await redisClient.getClient().info("memory");
		const memoryMatch = stats.match(/used_memory_human:(.+)/);
		const memoryUsage = memoryMatch ? memoryMatch[1].trim() : "Unknown";

		const dbsize = await redisClient.getClient().dbsize();

		res.json({
			success: true,
			redis: {
				connected: redisClient.isClientConnected(),
				latency: `${latency}ms`,
				memoryUsage,
				totalKeys: dbsize,
			},
		});
	} catch (error) {
		logger.error("Redis health check failed:", error);
		res.status(503).json({
			success: false,
			redis: {
				connected: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
		});
	}
};

// Example usage in routes:
/*
import express from 'express';
import {
	exampleDirectRedisUsage,
	exampleCachedEndpoint,
	exampleUserSpecificCache,
	exampleCacheInvalidation,
	redisHealthCheck
} from '../utils/redisExample';

const router = express.Router();

router.get('/profile', exampleDirectRedisUsage);
router.get('/cached-data', ...exampleCachedEndpoint);
router.get('/user-dashboard', ...exampleUserSpecificCache);
router.delete('/cache/user/:userId', exampleCacheInvalidation.invalidateUserCache);
router.delete('/cache/pattern', exampleCacheInvalidation.invalidatePatternCache);
router.delete('/cache/all', exampleCacheInvalidation.clearAllCache);
router.get('/health/redis', redisHealthCheck);

export default router;
*/
