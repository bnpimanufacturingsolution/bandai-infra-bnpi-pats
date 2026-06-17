import express, { Router } from "express";
import { controller } from "./document.controller";
import { router } from "./document.router";
import { PrismaClient } from "../../generated/prisma";

export const documentModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = documentModule;
