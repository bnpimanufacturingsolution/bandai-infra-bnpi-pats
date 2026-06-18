import express, { Router } from "express";
import { controller } from "./shiftType.controller";
import { router } from "./shiftType.router";
import { PrismaClient } from "../../generated/prisma";

export const shiftTypeModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = shiftTypeModule;
