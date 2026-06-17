import express, { Router } from "express";
import { controller } from "./employeeBenefit.controller";
import { router } from "./employeeBenefit.router";
import { PrismaClient } from "../../generated/prisma";

export const employeeBenefitModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = employeeBenefitModule;
