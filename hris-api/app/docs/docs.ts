import express, { Router } from "express";
import { controller } from "./docs.controller";
import { router as docsRouter } from "./docs.router";

export const docsModule = (prisma?: any, appInstance?: any): Router => {
	return docsRouter(express.Router(), controller(appInstance));
};

// For backward compatibility
module.exports = docsModule;
