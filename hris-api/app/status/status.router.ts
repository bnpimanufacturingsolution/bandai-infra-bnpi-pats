import { Router, Request, Response, NextFunction } from "express";

interface IStatusController {
	getStatus: (req: Request, res: Response, next: NextFunction) => Promise<void>;
	getStatusIncidents: (req: Request, res: Response, next: NextFunction) => Promise<void>;
	getStatusIncidentDetail: (req: Request, res: Response, next: NextFunction) => Promise<void>;
	getStatusTimelineData: (req: Request, res: Response, next: NextFunction) => Promise<void>;
	getStatusTimelineBatchData: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}

export const router = (route: Router, controller: IStatusController): Router => {
	route.get("/status", controller.getStatus);
	route.get("/status/modules", controller.getStatus);
	route.get("/status/incidents", controller.getStatusIncidents);
	route.get("/status/incidents/:incidentKey", controller.getStatusIncidentDetail);
	route.get("/status/timeline", controller.getStatusTimelineData);
	route.get("/status/timeline/batch", controller.getStatusTimelineBatchData);
	return route;
};
