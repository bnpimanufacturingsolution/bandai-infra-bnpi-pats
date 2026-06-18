import express, { Router } from "express";
import { controller } from "./requestTransaction.controller";
import { router } from "./requestTransaction.router";
import { PrismaClient } from "../../generated/prisma";

export const requestTransactionModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = requestTransactionModule;
