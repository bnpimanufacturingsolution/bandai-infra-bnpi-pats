import express, { Router } from "express";
import { controller } from "./position.controller";
import { router } from "./position.router";
import { PrismaClient } from "../../generated/prisma";

export const positionModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = positionModule;
