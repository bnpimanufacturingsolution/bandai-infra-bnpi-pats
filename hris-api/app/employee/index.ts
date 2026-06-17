import express, { Router } from "express";
import { controller } from "./employee.controller";
import { router } from "./employee.router";
import { PrismaClient } from "../../generated/prisma";

export const employeeModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = employeeModule;
