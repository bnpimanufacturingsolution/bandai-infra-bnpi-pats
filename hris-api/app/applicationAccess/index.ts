import express, { Router } from "express";
import { controller } from "./applicationAccess.controller";
import { router } from "./applicationAccess.router";
import { PrismaClient } from "../../generated/prisma";

export const applicationAccessModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = applicationAccessModule;
