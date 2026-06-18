import express, { Router } from "express";
import { controller } from "./soaremittance.controller";
import { router } from "./soaremittance.router";
import { PrismaClient } from "../../generated/prisma";

export const soaremittanceModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = soaremittanceModule;
