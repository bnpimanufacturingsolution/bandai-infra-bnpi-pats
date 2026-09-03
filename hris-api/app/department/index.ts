import express, { Router } from "express";
import { controller } from "./department.controller";
import { router } from "./department.router";
import { PrismaClient } from "../../generated/prisma";

export const departmentModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

// For backward compatibility
module.exports = departmentModule;
