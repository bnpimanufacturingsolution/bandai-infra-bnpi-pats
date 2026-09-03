import express, { Router } from "express";
import { controller } from "./leaveType.controller";
import { router } from "./leaveType.router";
import { PrismaClient } from "../../generated/prisma";

export const leaveTypeModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = leaveTypeModule;
