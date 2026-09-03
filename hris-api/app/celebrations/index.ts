import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./celebrations.controller";
import { router } from "./celebrations.router";

export const celebrationsModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = celebrationsModule;
