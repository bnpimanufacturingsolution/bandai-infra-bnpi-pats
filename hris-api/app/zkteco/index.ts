import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./zkteco.controller";
import { router } from "./zkteco.router";

export const zktecoModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = zktecoModule;
