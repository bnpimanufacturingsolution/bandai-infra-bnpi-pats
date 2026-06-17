import express, { Router } from "express";
import { controller } from "./checklistItem.controller";
import { router } from "./checklistItem.router";
import { PrismaClient } from "../../generated/prisma";

export const checklistItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = checklistItemModule;
