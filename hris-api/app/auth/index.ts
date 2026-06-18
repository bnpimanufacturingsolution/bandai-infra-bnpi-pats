import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./auth.controller";
import { router } from "./auth.router";

export const authModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = authModule;
