import express from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./employeeDocuments.controller";
import { router } from "./employeeDocuments.router";

module.exports = (prisma: PrismaClient) => {
	return router(express.Router(), controller(prisma));
};
