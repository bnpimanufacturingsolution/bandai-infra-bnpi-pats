import express, { Router } from "express";
import { controller } from "./benefitType.controller";
import { router } from "./benefitType.router";
import { PrismaClient } from "../../generated/prisma";

export const benefitTypeModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = benefitTypeModule;
