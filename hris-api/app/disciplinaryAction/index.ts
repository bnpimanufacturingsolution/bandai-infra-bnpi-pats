import express, { Router } from "express";
import { controller } from "./disciplinaryAction.controller";
import { router } from "./disciplinaryAction.router";
import { PrismaClient } from "../../generated/prisma";

export const disciplinaryActionModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = disciplinaryActionModule;
