import { Request, Response, NextFunction } from "express";
import { redisClient } from "../config/redis";
import { getLogger } from "../helper/logger.helper";
import { AuthRequest } from "./verifyToken";

const logger = getLogger();

export interface CacheOptions {
	ttl?: number; // Time to live in seconds
	keyGenerator?: (req: Request) => string;
	skipCache?: (req: Request) => boolean;
	onHit?: (key: string, data: any) => void;
	onMiss?: (key: string) => void;
	onError?: (error: Error) => void;
}

export class CacheManager {
	private static instance: CacheManager;
	private defaultTTL: number = 3600; // 1 hour

	private constructor() {}

	static getInstance(): CacheManager {
		if (!CacheManager.instance) {
			CacheManager.instance = new CacheManager();
		}
		return CacheManager.instance;
	}

	/**
	 * Generate cache key from request
	 */
	private generateCacheKey(req: Request, keyGenerator?: (req: Request) => string): string {
		if (keyGenerator) {
			return keyGenerator(req);
		}

		const { method, originalUrl, query, body } = req;
		const userId = (req as AuthRequest).userId || "anonymous";

		// Create a consistent key from request data
		const keyData = {
			method,
			url: originalUrl,
			query,
			body: method === "GET" ? undefined : body,
			userId,
		};

		const keyString = JSON.stringify(keyData);
		return `cache:${Buffer.from(keyString).toString("base64")}`;
	}

	/**
	 * Cache middleware for GET requests
	 */
	cache(options: CacheOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
		return async (req: Request, res: Response, next: NextFunction) => {
			// Skip caching for non-GET requests by default
			if (req.method !== "GET") {
				return next();
			}

			// Skip cache if condition is met
			if (options.skipCache && options.skipCache(req)) {
				return next();
			}

			// Skip if Redis is not connected
			if (!redisClient.isClientConnected()) {
				logger.warn("Redis not connected, skipping cache");
				return next();
			}

			const cacheKey = this.generateCacheKey(req, options.keyGenerator);
			const ttl = options.ttl || this.defaultTTL;

			try {
				// Try to get cached data
				const cachedData = await redisClient.getJSON(cacheKey);

				if (cachedData) {
					// Cache hit
					logger.info(`Cache hit for key: ${cacheKey}`);
					if (options.onHit) {
						options.onHit(cacheKey, cachedData);
					}

					// Set cache headers
					res.set({
						"X-Cache": "HIT",
						"X-Cache-Key": cacheKey,
					});

					return res.json(cachedData);
				}

				// Cache miss - continue to route handler
				logger.info(`Cache miss for key: ${cacheKey}`);
				if (options.onMiss) {
					options.onMiss(cacheKey);
				}

				// Override res.json to cache the response
				const originalJson = res.json;
				res.json = function (body: any) {
					// Only cache successful responses
					if (res.statusCode >= 200 && res.statusCode < 300) {
						redisClient.setJSON(cacheKey, body, ttl).catch((error) => {
							logger.error(`Failed to cache response for key ${cacheKey}:`, error);
							if (options.onError) {
								options.onError(error);
							}
						});
					}

					// Set cache headers
					res.set({
						"X-Cache": "MISS",
						"X-Cache-Key": cacheKey,
						"X-Cache-TTL": ttl.toString(),
					});

					return originalJson.call(this, body);
				};

				next();
			} catch (error) {
				logger.error(`Cache middleware error for key ${cacheKey}:`, error);
				if (options.onError) {
					options.onError(error as Error);
				}
				// Continue without caching on error
				next();
			}
		};
	}

	/**
	 * Invalidate cache by pattern
	 */
	async invalidatePattern(pattern: string): Promise<number> {
		try {
			if (!redisClient.isClientConnected()) {
				logger.warn("Redis not connected, cannot invalidate cache");
				return 0;
			}

			const client = redisClient.getClient();
			const keys = await client.keys(pattern);

			if (keys.length === 0) {
				return 0;
			}

			const result = await client.del(...keys);
			logger.info(`Invalidated ${result} cache entries matching pattern: ${pattern}`);
			return result;
		} catch (error) {
			logger.error(`Failed to invalidate cache pattern ${pattern}:`, error);
			throw error;
		}
	}

	/**
	 * Invalidate cache by key
	 */
	async invalidateKey(key: string): Promise<number> {
		try {
			if (!redisClient.isClientConnected()) {
				logger.warn("Redis not connected, cannot invalidate cache");
				return 0;
			}

			const result = await redisClient.del(key);
			logger.info(`Invalidated cache key: ${key}`);
			return result;
		} catch (error) {
			logger.error(`Failed to invalidate cache key ${key}:`, error);
			throw error;
		}
	}

	/**
	 * Clear all cache
	 */
	async clearAll(): Promise<void> {
		try {
			if (!redisClient.isClientConnected()) {
				logger.warn("Redis not connected, cannot clear cache");
				return;
			}

			const client = redisClient.getClient();
			await client.flushdb();
			logger.info("Cleared all cache");
		} catch (error) {
			logger.error("Failed to clear all cache:", error);
			throw error;
		}
	}

	/**
	 * Get cache statistics
	 */
	async getStats(): Promise<{
		totalKeys: number;
		memoryUsage: string;
		hitRate?: number;
	}> {
		try {
			if (!redisClient.isClientConnected()) {
				return {
					totalKeys: 0,
					memoryUsage: "0B",
				};
			}

			const client = redisClient.getClient();
			const info = await client.info("memory");
			const dbsize = await client.dbsize();

			// Parse memory usage from info
			const memoryMatch = info.match(/used_memory_human:(.+)/);
			const memoryUsage = memoryMatch ? memoryMatch[1].trim() : "Unknown";

			return {
				totalKeys: dbsize,
				memoryUsage,
			};
		} catch (error) {
			logger.error("Failed to get cache stats:", error);
			throw error;
		}
	}
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();

// Export convenient middleware functions
export const cache = (options?: CacheOptions) => cacheManager.cache(options);

// Specific cache middleware for common use cases
export const cacheShort = cache({ ttl: 60 }); // 1 minute
export const cacheMedium = cache({ ttl: 90 }); // 1:30 minutes
export const cacheLong = cache({ ttl: 7200 }); // 2 hours

// User-specific cache
export const cacheUser = cache({
	keyGenerator: (req: Request) => {
		const userId = (req as AuthRequest).userId || "anonymous";
		return `user:${userId}:${req.originalUrl}:${JSON.stringify(req.query)}`;
	},
});

// Public cache (no user-specific data)
export const cachePublic = cache({
	keyGenerator: (req: Request) => {
		return `public:${req.originalUrl}:${JSON.stringify(req.query)}`;
	},
});

// Export cache invalidation helpers
export const invalidateCache = {
	byPattern: (pattern: string) => cacheManager.invalidatePattern(pattern),
	byKey: (key: string) => cacheManager.invalidateKey(key),
	byUser: (userId: string) => cacheManager.invalidatePattern(`user:${userId}:*`),
	public: () => cacheManager.invalidatePattern("public:*"),
	all: () => cacheManager.clearAll(),
};

export default cacheManager;
