import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./dashboard.controller";
import { router } from "./dashboard.router";

export const dashboardModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = dashboardModule;
