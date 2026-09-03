import express, { Router } from "express";
import { controller } from "./employeeLoan.controller";
import { router } from "./employeeLoan.router";
import { PrismaClient } from "../../generated/prisma";

export const employeeLoanModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = employeeLoanModule;
