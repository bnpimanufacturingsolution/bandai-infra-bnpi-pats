import express, { Router } from "express";
import { controller } from "./level.controller";
import { router } from "./level.router";
import { PrismaClient } from "../../generated/prisma";

export const levelModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = levelModule;
