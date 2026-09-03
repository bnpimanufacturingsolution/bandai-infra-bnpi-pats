import express, { Router } from "express";
import { controller } from "./note.controller";
import { router } from "./note.router";
import { PrismaClient } from "../../generated/prisma";

export const noteModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = noteModule;
