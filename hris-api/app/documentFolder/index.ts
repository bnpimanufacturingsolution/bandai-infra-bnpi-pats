import { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./documentFolder.controller";
import { router } from "./documentFolder.router";

export = (prisma: PrismaClient): Router => {
	const route = Router();
	return router(route, controller(prisma));
};
