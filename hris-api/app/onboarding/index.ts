import express, { Router } from "express";
import { controller } from "./onboarding.controller";
import { router } from "./onboarding.router";
import { PrismaClient } from "../../generated/prisma";

export const onboardingModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = onboardingModule;
