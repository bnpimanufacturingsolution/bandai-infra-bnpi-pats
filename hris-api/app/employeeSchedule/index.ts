import express, { Router } from "express";
import { controller } from "./employeeSchedule.controller";
import { router } from "./employeeSchedule.router";
import { PrismaClient } from "../../generated/prisma";

export const employeeScheduleModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = employeeScheduleModule;

