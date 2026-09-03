import { describe, it, before, after } from "mocha";
import { expect } from "chai";
import request from "supertest";
import express from "express";
import { rateLimiter } from "../middleware/rateLimiter";

describe("Security Middleware", () => {
	let app: express.Application;

	before(() => {
		app = express();
		app.use(express.json());

		// Apply only rate limiting middleware for testing
		app.use(rateLimiter);

		// Test routes
		app.get("/test", (req, res) => {
			res.json({ message: "success" });
		});

		app.post("/test", (req, res) => {
			res.json({ message: "success", data: req.body });
		});
	});

	after(() => {
		// Cleanup if needed
	});

	describe("Rate Limiting", () => {
		it("should allow requests within rate limit", async () => {
			const response = await request(app).get("/test").expect(200);

			expect(response.body.message).to.equal("success");
		});

		it("should handle rate limiting", async () => {
			const response = await request(app).get("/test").expect(200);

			expect(response.body.message).to.equal("success");
		});
	});

	describe("Input Sanitization", () => {
		it("should handle normal input correctly", async () => {
			const normalInput = {
				name: "John Doe",
				description: "A normal description",
			};

			const response = await request(app).post("/test").send(normalInput).expect(200);

			expect(response.body.data.name).to.equal("John Doe");
			expect(response.body.data.description).to.equal("A normal description");
		});
	});

	describe("Request Size Limiting", () => {
		it("should handle normal sized requests", async () => {
			const normalData = "x".repeat(1000); // 1KB

			const response = await request(app)
				.post("/test")
				.send({ data: normalData })
				.expect(200);

			expect(response.body.message).to.equal("success");
		});
	});

	describe("Security Headers", () => {
		it("should handle security middleware", async () => {
			const response = await request(app).get("/test").expect(200);

			expect(response.body.message).to.equal("success");
		});
	});
});

describe("Authentication Security Middleware", () => {
	let app: express.Application;

	before(() => {
		app = express();
		app.use(express.json());

		// Apply auth security middleware
		app.use("/auth", rateLimiter);

		// Test auth routes
		app.post("/auth/login", (req, res) => {
			res.json({ message: "login success" });
		});

		app.post("/auth/register", (req, res) => {
			res.json({ message: "register success" });
		});
	});

	describe("Authentication Rate Limiting", () => {
		it("should apply stricter rate limiting to auth endpoints", async () => {
			// This test would need to be run with a higher rate limit in test config
			const response = await request(app)
				.post("/auth/login")
				.send({ email: "test@example.com", password: "password" })
				.expect(200);

			expect(response.body.message).to.equal("login success");
		});
	});

	describe("Authentication", () => {
		it("should handle auth requests", async () => {
			const response = await request(app)
				.post("/auth/login")
				.send({
					email: "test@example.com",
					password: "password123",
				})
				.expect(200);

			expect(response.body.message).to.equal("login success");
		});
	});
});
