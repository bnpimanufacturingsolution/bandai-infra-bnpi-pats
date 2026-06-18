import express, { Router } from "express";
import { controller } from "./loanType.controller";
import { router } from "./loanType.router";
import { PrismaClient } from "../../generated/prisma";

export const loanTypeModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = loanTypeModule;
