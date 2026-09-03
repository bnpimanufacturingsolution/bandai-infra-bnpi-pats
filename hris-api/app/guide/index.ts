import express, { Router } from "express";
import { controller } from "./guide.controller";
import { router } from "./guide.router";
import { PrismaClient } from "../../generated/prisma";

export const guideModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = guideModule;
