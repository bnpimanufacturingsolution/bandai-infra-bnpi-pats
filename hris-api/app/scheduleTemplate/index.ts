import express, { Router } from "express";
import { controller } from "./scheduleScheduleTemplate.controller";
import { router } from "./scheduleScheduleTemplate.router";
import { PrismaClient } from "../../generated/prisma";

export const scheduleTemplateModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = scheduleTemplateModule;
