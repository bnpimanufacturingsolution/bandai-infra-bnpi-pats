import express, { Router } from "express";
import { controller } from "./person.controller";
import { router } from "./person.router";
import { PrismaClient } from "../../generated/prisma";

export const personModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = personModule;
