import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./status.controller";
import { router } from "./status.router";

export const statusModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = statusModule;
