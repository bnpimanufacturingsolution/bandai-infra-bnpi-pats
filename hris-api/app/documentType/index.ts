import express, { Router } from "express";
import { controller } from "./documentType.controller";
import { router } from "./documentType.router";
import { PrismaClient } from "../../generated/prisma";

export const documentTypeModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = documentTypeModule;
