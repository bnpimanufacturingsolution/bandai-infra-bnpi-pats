import express, { Router } from "express";
import { controller } from "./scheduleOverride.controller";
import { router } from "./scheduleOverride.router";
import { PrismaClient } from "../../generated/prisma";

export const scheduleOverrideModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = scheduleOverrideModule;
