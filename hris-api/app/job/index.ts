import express, { Router } from "express";
import { controller } from "./job.controller";
import { router } from "./job.router";
import { PrismaClient } from "../../generated/prisma";

export const jobModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = jobModule;
