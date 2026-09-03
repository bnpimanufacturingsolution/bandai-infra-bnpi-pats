import express, { Router } from "express";
import { controller } from "./applicant.controller";
import { router } from "./applicant.router";
import { PrismaClient } from "../../generated/prisma";

export const applicantModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = applicantModule;
