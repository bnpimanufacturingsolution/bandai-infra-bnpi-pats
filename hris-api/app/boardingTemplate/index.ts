import express, { Router } from "express";

import { PrismaClient } from "../../generated/prisma";
import { controller } from "./boardingtemplate.controller";
import { router } from "./boardingTemplate.router";

export const boardingTemplateModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = boardingTemplateModule;
