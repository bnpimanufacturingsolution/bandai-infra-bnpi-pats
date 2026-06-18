import express, { Router } from "express";
import { controller } from "./timesheet.controller";
import { router } from "./timesheet.router";
import { PrismaClient } from "../../generated/prisma";

export const timesheetModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = timesheetModule;
