import express, { Router } from "express";
import { controller } from "./timesheetline.controller";
import { router } from "./timesheetline.router";
import { PrismaClient } from "../../generated/prisma";

export const timesheetlineModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = timesheetlineModule;
