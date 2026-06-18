import express, { Router } from "express";
import { controller } from "./employeepayroll.controller";
import { router } from "./employeepayroll.router";
import { PrismaClient } from "../../generated/prisma";

export const employeePayrollModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = employeePayrollModule;
