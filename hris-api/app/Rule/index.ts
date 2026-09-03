import express, { Router } from "express";
import { controller } from "./rule.controller";
import { router } from "./rule.router";
import { PrismaClient } from "../../generated/prisma";

export const RuleModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = RuleModule;
