import express, { Router } from "express";
import { controller } from "./request.controller";
import { router } from "./request.router";
import { PrismaClient } from "../../generated/prisma";

export const requestModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = requestModule;
