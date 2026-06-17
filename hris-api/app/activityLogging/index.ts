import express, { Router } from "express";
import { controller } from "./activityLogging.controller";
import { router } from "./activityLogging.router";
import { PrismaClient } from "../../generated/prisma";

export const activityLoggingModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = activityLoggingModule;
