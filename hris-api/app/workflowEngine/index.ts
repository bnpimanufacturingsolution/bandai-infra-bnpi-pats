import express, { Router } from "express";
import { controller } from "./workflowEngine.controller";
import { router } from "./workflowEngine.router";
import { PrismaClient } from "../../generated/prisma";

export const workflowEngineModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = workflowEngineModule;
