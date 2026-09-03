import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./agency.controller";
import { router } from "./agency.router";

export const agencyModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = agencyModule;
