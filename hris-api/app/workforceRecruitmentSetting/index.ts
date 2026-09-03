import express, { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { controller } from "./workforceRecruitmentSetting.controller";
import { router } from "./workforceRecruitmentSetting.router";

export const workforceRecruitmentSettingModule = (prisma: PrismaClient): Router =>
	router(express.Router(), controller(prisma));

module.exports = workforceRecruitmentSettingModule;
