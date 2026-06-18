import express, { Router } from "express";
import { controller } from "./payrollperiod.controller";
import { router } from "./payrollperiod.router";
import { PrismaClient } from "../../generated/prisma";

export const payrollPeriodModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = payrollPeriodModule;
