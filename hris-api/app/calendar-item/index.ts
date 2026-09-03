import express, { Router } from "express";
import { controller } from "./calendar-item.controller";
import { router } from "./calendar-item.router";
import { PrismaClient } from "../../generated/prisma";

export const calendarItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = calendarItemModule;
