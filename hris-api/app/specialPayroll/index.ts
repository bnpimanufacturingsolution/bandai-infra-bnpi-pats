import express, { Router } from "express";
import { controller } from "./specialPayroll.controller";
import { router } from "./specialPayroll.router";
import { PrismaClient } from "../../generated/prisma";

export const specialPayrollModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility with require() registration in index.ts
module.exports = specialPayrollModule;
