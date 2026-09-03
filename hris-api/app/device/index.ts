import express, { Router } from "express";
import { controller } from "./device.controller";
import { router } from "./device.router";
import { PrismaClient } from "../../generated/prisma";

export const deviceModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = deviceModule;
