import express, { Router } from "express";
import { controller } from "./calculator.controller";
import { router } from "./calculator.router";
import { PrismaClient } from "../../generated/prisma";

export const calculatorModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = calculatorModule;
