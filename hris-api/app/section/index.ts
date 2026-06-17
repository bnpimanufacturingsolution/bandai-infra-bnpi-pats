import express, { Router } from "express";
import { controller } from "./section.controller";
import { router } from "./section.router";
import { PrismaClient } from "../../generated/prisma";

export const sectionModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = sectionModule;
