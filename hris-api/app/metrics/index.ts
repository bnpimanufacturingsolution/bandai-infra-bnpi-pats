import express, { Router } from "express";
import { controller } from "./metrics.controller";
import { router } from "./metrics.router";
import { PrismaClient } from "../../generated/prisma";

export const metricsModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = metricsModule;

