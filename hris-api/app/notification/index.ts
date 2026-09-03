import express, { Router } from "express";
import { controller } from "./notification.controller";
import { router } from "./notification.router";
import { PrismaClient } from "../../generated/prisma";

export const notificationModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = notificationModule;
