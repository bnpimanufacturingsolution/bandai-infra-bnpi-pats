import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./workflowConfig.controller";
import { router } from "./workflowConfig.router";

export const workflowConfigModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = workflowConfigModule;
