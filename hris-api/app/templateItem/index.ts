import express, { Router } from "express";

import { PrismaClient } from "../../generated/prisma";
import { controller } from "./templateItem.controller";
import { router } from "./templateItem.router";

export const templateItemItemItemModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = templateItemItemItemModule;
