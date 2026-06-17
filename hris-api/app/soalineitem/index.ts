import express, { Router } from "express";
import { controller } from "./soalineitem.controller";
import { router } from "./soalineitem.router";
import { PrismaClient } from "../../generated/prisma";

export const soalineitemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = soalineitemModule;
