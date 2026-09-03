import express, { Router } from "express";
import { controller } from "./leaveSetting.controller";
import { router } from "./leaveSetting.router";
import { PrismaClient } from "../../generated/prisma";

export const leaveSettingModule = (prisma: PrismaClient): Router => {
	return router(express.Router(), controller(prisma));
};

module.exports = leaveSettingModule;
