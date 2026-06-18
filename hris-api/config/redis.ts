import Redis from "ioredis";
import dotenv from "dotenv";
import { getLogger } from "../helper/logger.helper";

const logger = getLogger();

dotenv.config();

export interface RedisConfig {
	host: string;
	port: number;
	password?: string;
	db?: number;
	maxRetriesPerRequest?: number;
	lazyConnect?: boolean;
	keepAlive?: number;
	family?: number;
	connectTimeout?: number;
	commandTimeout?: number;
	retryDelayOnFailover?: number;
	enableOfflineQueue?: boolean;
	enableReadyCheck?: boolean;
	maxLoadingTimeout?: number;
}

export const redisConfig: RedisConfig = {
	host: process.env.REDIS_HOST || "localhost",
	port: parseInt(process.env.REDIS_PORT || "6379"),
	password: process.env.REDIS_PASSWORD || undefined,
	db: parseInt(process.env.REDIS_DB || "0"),
	maxRetriesPerRequest: 0, // Disable automatic retries
	lazyConnect: true,
	keepAlive: 30000,
	family: 4,
	connectTimeout: 10000,
	commandTimeout: 5000,
	// Add circuit breaker configuration
	retryDelayOnFailover: 100,
	enableOfflineQueue: false, // Don't queue commands when offline
	enableReadyCheck: true,
	maxLoadingTimeout: 5000,
};

class RedisClient {
	private client: Redis;
	private isConnected: boolean = false;
	private connectionAttempts: number = 0;
	private maxConnectionAttempts: number = 3; // Reduced from 5
	private circuitBreakerOpen: boolean = false;
	private lastConnectionAttempt: number = 0;
	private circuitBreakerTimeout: number = 60000; // 60 seconds
	private hasAttemptedConnection: boolean = false; // Track if we've already tried
	private isConnecting: boolean = false; // Prevent multiple simultaneous connection attempts

	constructor(config: RedisConfig) {
		this.client = new Redis({
			host: config.host,
			port: config.port,
			password: config.password,
			db: config.db,
			maxRetriesPerRequest: 0, // Disable automatic retries
			lazyConnect: true,
			keepAlive: config.keepAlive,
			family: config.family,
			connectTimeout: config.connectTimeout,
			commandTimeout: config.commandTimeout,
			enableOfflineQueue: false, // Don't queue commands when offline
			enableReadyCheck: true,
		});

		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		this.client.on("connect", () => {
			this.isConnected = true;
			this.isConnecting = false;
			this.connectionAttempts = 0;
			this.circuitBreakerOpen = false;
			logger.info("Connected to Redis successfully");
		});

		this.client.on("ready", () => {
			logger.info("Redis client ready to accept commands");
		});

		this.client.on("error", (error: any) => {
			this.isConnected = false;
			this.isConnecting = false;

			// Only increment attempts if we haven't exceeded max attempts
			if (this.connectionAttempts < this.maxConnectionAttempts) {
				this.connectionAttempts++;
			}

			// Implement circuit breaker - only log once when it opens
			if (this.connectionAttempts >= this.maxConnectionAttempts && !this.circuitBreakerOpen) {
				this.circuitBreakerOpen = true;
				this.lastConnectionAttempt = Date.now();
				logger.warn(
					`Redis circuit breaker opened after ${this.connectionAttempts} failed attempts`,
				);
			}

			// Only log error if circuit breaker is not open to prevent spam
			if (!this.circuitBreakerOpen) {
				logger.error("Redis client error:", error);
			}
		});

		this.client.on("close", () => {
			this.isConnected = false;
			this.isConnecting = false;
			// Only log if circuit breaker is not open
			if (!this.circuitBreakerOpen) {
				logger.warn("Redis client connection closed");
			}
		});

		// Remove reconnecting event listener to prevent spam
		// this.client.on("reconnecting", (ms: any) => {
		// 	// Only log if circuit breaker is not open
		// 	if (!this.circuitBreakerOpen) {
		// 		logger.info(`Redis client reconnecting in ${ms}ms`);
		// 	}
		// });

		this.client.on("end", () => {
			this.isConnected = false;
			this.isConnecting = false;
			// Only log if circuit breaker is not open
			if (!this.circuitBreakerOpen) {
				logger.warn("Redis client connection ended");
			}
		});
	}

	private shouldAttemptConnection(): boolean {
		// Don't attempt if already connected or currently connecting
		if (this.isConnected || this.isConnecting) {
			return false;
		}

		// Check circuit breaker
		if (this.circuitBreakerOpen) {
			const timeSinceLastAttempt = Date.now() - this.lastConnectionAttempt;
			if (timeSinceLastAttempt < this.circuitBreakerTimeout) {
				return false; // Circuit breaker still open
			}
			// Reset circuit breaker after timeout
			this.circuitBreakerOpen = false;
			this.connectionAttempts = 0;
			logger.info("Redis circuit breaker reset, attempting connection");
		}

		// Only attempt once per application lifecycle
		if (this.hasAttemptedConnection && this.connectionAttempts >= this.maxConnectionAttempts) {
			return false;
		}

		return true;
	}

	async connect(): Promise<void> {
		try {
			if (!this.shouldAttemptConnection()) {
				if (this.circuitBreakerOpen) {
					logger.warn("Redis connection skipped - circuit breaker is open");
				}
				return;
			}

			this.isConnecting = true;
			this.hasAttemptedConnection = true;

			await this.client.connect();
			logger.info("Redis connection established");
		} catch (error) {
			this.isConnecting = false;
			logger.error("Failed to connect to Redis:", error);
			// Don't throw error to prevent app crashes
			logger.warn("Application will continue without Redis caching functionality");
		}
	}

	async disconnect(): Promise<void> {
		try {
			if (this.isConnected) {
				await this.client.quit();
				logger.info("Redis connection closed gracefully");
			}
		} catch (error) {
			logger.error("Error closing Redis connection:", error);
			throw error;
		}
	}

	getClient(): Redis {
		return this.client;
	}

	isClientConnected(): boolean {
		return this.isConnected;
	}

	async ping(): Promise<string> {
		try {
			return await this.client.ping();
		} catch (error) {
			logger.error("Redis ping failed:", error);
			throw error;
		}
	}

	// Cache utility methods with fallback
	async get(key: string): Promise<string | null> {
		if (!this.isConnected || this.circuitBreakerOpen) {
			logger.warn(`Redis GET skipped for key ${key} - Redis unavailable`);
			return null;
		}
		try {
			return await this.client.get(key);
		} catch (error) {
			logger.error(`Redis GET error for key ${key}:`, error);
			return null; // Return null instead of throwing
		}
	}

	async set(
		key: string,
		value: string,
		ttlOrOptions?: number | { ttl?: number; nx?: boolean },
	): Promise<string> {
		if (!this.isConnected || this.circuitBreakerOpen) {
			logger.warn(`Redis SET skipped for key ${key} - Redis unavailable`);
			return "OK"; // Return success to prevent app errors
		}
		try {
			const ttl =
				typeof ttlOrOptions === "number" ? ttlOrOptions : ttlOrOptions?.ttl;
			const nx =
				typeof ttlOrOptions === "number" ? false : Boolean(ttlOrOptions?.nx);

			if (nx && ttl) {
				return (await this.client.set(key, value, "EX", ttl, "NX")) || "";
			}
			if (nx) {
				return (await this.client.set(key, value, "NX")) || "";
			}
			if (ttl) {
				return await this.client.setex(key, ttl, value);
			}
			return await this.client.set(key, value);
		} catch (error) {
			logger.error(`Redis SET error for key ${key}:`, error);
			return "OK"; // Return success to prevent app errors
		}
	}

	async del(key: string): Promise<number> {
		if (!this.isConnected || this.circuitBreakerOpen) {
			logger.warn(`Redis DEL skipped for key ${key} - Redis unavailable`);
			return 0;
		}
		try {
			return await this.client.del(key);
		} catch (error) {
			logger.error(`Redis DEL error for key ${key}:`, error);
			return 0;
		}
	}

	async exists(key: string): Promise<number> {
		if (!this.isConnected || this.circuitBreakerOpen) {
			logger.warn(`Redis EXISTS skipped for key ${key} - Redis unavailable`);
			return 0;
		}
		try {
			return await this.client.exists(key);
		} catch (error) {
			logger.error(`Redis EXISTS error for key ${key}:`, error);
			return 0;
		}
	}

	async expire(key: string, seconds: number): Promise<number> {
		if (!this.isConnected || this.circuitBreakerOpen) {
			logger.warn(`Redis EXPIRE skipped for key ${key} - Redis unavailable`);
			return 0;
		}
		try {
			return await this.client.expire(key, seconds);
		} catch (error) {
			logger.error(`Redis EXPIRE error for key ${key}:`, error);
			return 0;
		}
	}

	async ttl(key: string): Promise<number> {
		if (!this.isConnected || this.circuitBreakerOpen) {
			logger.warn(`Redis TTL skipped for key ${key} - Redis unavailable`);
			return -1;
		}
		try {
			return await this.client.ttl(key);
		} catch (error) {
			logger.error(`Redis TTL error for key ${key}:`, error);
			return -1;
		}
	}

	// JSON operations
	async setJSON(key: string, value: any, ttl?: number): Promise<string> {
		if (!this.isConnected || this.circuitBreakerOpen) {
			logger.warn(`Redis SET JSON skipped for key ${key} - Redis unavailable`);
			return "OK";
		}
		try {
			const jsonValue = JSON.stringify(value);
			return await this.set(key, jsonValue, ttl);
		} catch (error) {
			logger.error(`Redis SET JSON error for key ${key}:`, error);
			return "OK";
		}
	}

	async getJSON<T>(key: string): Promise<T | null> {
		if (!this.isConnected || this.circuitBreakerOpen) {
			logger.warn(`Redis GET JSON skipped for key ${key} - Redis unavailable`);
			return null;
		}
		try {
			const value = await this.get(key);
			if (!value) return null;
			return JSON.parse(value) as T;
		} catch (error) {
			logger.error(`Redis GET JSON error for key ${key}:`, error);
			return null;
		}
	}

	async incr(key: string): Promise<number> {
		try {
			return await this.client.incr(key);
		} catch (error) {
			logger.error(`Redis INCR error for key ${key}:`, error);
			throw error;
		}
	}

	// Hash operations
	async hset(key: string, field: string, value: string): Promise<number> {
		try {
			return await this.client.hset(key, field, value);
		} catch (error) {
			logger.error(`Redis HSET error for key ${key}, field ${field}:`, error);
			throw error;
		}
	}

	async hget(key: string, field: string): Promise<string | null> {
		try {
			return await this.client.hget(key, field);
		} catch (error) {
			logger.error(`Redis HGET error for key ${key}, field ${field}:`, error);
			throw error;
		}
	}

	async hgetall(key: string): Promise<Record<string, string>> {
		try {
			return await this.client.hgetall(key);
		} catch (error) {
			logger.error(`Redis HGETALL error for key ${key}:`, error);
			throw error;
		}
	}

	async hdel(key: string, field: string): Promise<number> {
		try {
			return await this.client.hdel(key, field);
		} catch (error) {
			logger.error(`Redis HDEL error for key ${key}, field ${field}:`, error);
			throw error;
		}
	}

	// List operations
	async lpush(key: string, value: string): Promise<number> {
		try {
			return await this.client.lpush(key, value);
		} catch (error) {
			logger.error(`Redis LPUSH error for key ${key}:`, error);
			throw error;
		}
	}

	async rpush(key: string, value: string): Promise<number> {
		try {
			return await this.client.rpush(key, value);
		} catch (error) {
			logger.error(`Redis RPUSH error for key ${key}:`, error);
			throw error;
		}
	}

	async lpop(key: string): Promise<string | null> {
		try {
			return await this.client.lpop(key);
		} catch (error) {
			logger.error(`Redis LPOP error for key ${key}:`, error);
			throw error;
		}
	}

	async rpop(key: string): Promise<string | null> {
		try {
			return await this.client.rpop(key);
		} catch (error) {
			logger.error(`Redis RPOP error for key ${key}:`, error);
			throw error;
		}
	}

	async lrange(key: string, start: number, stop: number): Promise<string[]> {
		try {
			return await this.client.lrange(key, start, stop);
		} catch (error) {
			logger.error(`Redis LRANGE error for key ${key}:`, error);
			throw error;
		}
	}

	// Set operations
	async sadd(key: string, value: string): Promise<number> {
		try {
			return await this.client.sadd(key, value);
		} catch (error) {
			logger.error(`Redis SADD error for key ${key}:`, error);
			throw error;
		}
	}

	async srem(key: string, value: string): Promise<number> {
		try {
			return await this.client.srem(key, value);
		} catch (error) {
			logger.error(`Redis SREM error for key ${key}:`, error);
			throw error;
		}
	}

	async smembers(key: string): Promise<string[]> {
		try {
			return await this.client.smembers(key);
		} catch (error) {
			logger.error(`Redis SMEMBERS error for key ${key}:`, error);
			throw error;
		}
	}

	async sismember(key: string, value: string): Promise<number> {
		try {
			return await this.client.sismember(key, value);
		} catch (error) {
			logger.error(`Redis SISMEMBER error for key ${key}:`, error);
			throw error;
		}
	}

	async publish(channel: string, message: string): Promise<number> {
		try {
			return await this.client.publish(channel, message);
		} catch (error) {
			logger.error(`Redis PUBLISH error for channel ${channel}:`, error);
			throw error;
		}
	}
}

// Create and export Redis client instance
export const redisClient = new RedisClient(redisConfig);

// Export Redis utilities
export { Redis };
export default redisClient;
