import express, { Router } from "express";
import { controller } from "./report.controller";
import { router } from "./report.router";
import { PrismaClient } from "../../generated/prisma";

export const reportModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = reportModule;
