import express, { Router } from "express";
import { controller } from "./statementofaccount.controller";
import { router } from "./statementofaccount.router";
import { PrismaClient } from "../../generated/prisma";

export const statementofaccountModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = statementofaccountModule;
