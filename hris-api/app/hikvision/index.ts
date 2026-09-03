import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { router as usersRouter } from "./routes/users.router";
import { router as accessControlRouter } from "./routes/access.control.router";
import { router as callbackRouter } from "./routes/callback.router";
import { router as publicRouter } from "./routes/public.router";
import { controller as usersController } from "./controller/users.controller";
import { controller as accessControlController } from "./controller/access.control.controller";
import { controller as callbackController } from "./controller/callback.controller";
import verifyToken from "../../middleware/verifyToken";

export const hikvisionModule = (prisma: PrismaClient): Router => {
	const mainRouter = express.Router();
	const path = "/hikvision";

	// Debug: Test route to verify router is accessible
	mainRouter.get("/test", (req, res) => {
		res.status(200).json({
			message: "Hikvision router is working",
			path: req.path,
			originalUrl: req.originalUrl,
			baseUrl: req.baseUrl,
			timestamp: new Date().toISOString(),
		});
	});

	// Mount protected device proxy routers. Callback/public stay open below.
	usersRouter(mainRouter, usersController(prisma), verifyToken);
	accessControlRouter(mainRouter, accessControlController(prisma), verifyToken);
	callbackRouter(mainRouter, callbackController(prisma));
	publicRouter(mainRouter);

	return mainRouter;
};

// For backward compatibility
module.exports = hikvisionModule;
