import express, { Router } from "express";
import { controller } from "./boardingProcess.controller";
import { router } from "./boardingProcess.router";
import { PrismaClient } from "../../generated/prisma";

export const boardingProcessModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = boardingProcessModule;
