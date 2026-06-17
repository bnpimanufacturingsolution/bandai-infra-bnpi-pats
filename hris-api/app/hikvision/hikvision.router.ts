import { Router } from "express";
import { router as usersRouter } from "./routes/users.router";
import { router as accessControlRouter } from "./routes/access.control.router";
import { router as callbackRouter } from "./routes/callback.router";
import { controller as usersController } from "./controller/users.controller";
import { controller as accessControlController } from "./controller/access.control.controller";
import { controller as callbackController } from "./controller/callback.controller";
import { PrismaClient } from "../../generated/prisma";

export const router = (prisma: PrismaClient): Router => {
	const mainRouter = Router();
	const path = "/hikvision";

	// Mount sub-routers
	usersRouter(mainRouter, usersController(prisma));
	accessControlRouter(mainRouter, accessControlController(prisma));
	callbackRouter(mainRouter, callbackController(prisma));

	return mainRouter;
};
