import express, { Router } from "express";
import { controller } from "./migration.controller";
import { router } from "./migration.router";
import { PrismaClient } from "../../generated/prisma";

export const migrationModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = migrationModule;
