import express, { Router } from "express";
import { controller } from "./termination.controller";
import { router } from "./termination.router";
import { PrismaClient } from "../../generated/prisma";

export const terminationModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = terminationModule;
