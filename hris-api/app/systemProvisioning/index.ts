import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./systemProvisioning.controller";
import { router } from "./systemProvisioning.router";

export const systemProvisioningModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = systemProvisioningModule;
