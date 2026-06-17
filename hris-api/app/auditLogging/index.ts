import express, { Router } from "express";
import { controller } from "./auditLogging.controller";
import { router } from "./auditLogging.router";
import { PrismaClient } from "../../generated/prisma";

export const auditLoggingModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = auditLoggingModule;
