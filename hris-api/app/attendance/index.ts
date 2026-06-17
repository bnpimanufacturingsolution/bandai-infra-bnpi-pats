import express, { Router } from "express";
import { controller } from "./attendance.controller";
import { router } from "./attendance.router";
import { PrismaClient } from "../../generated/prisma";

export const attendanceModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = attendanceModule;
