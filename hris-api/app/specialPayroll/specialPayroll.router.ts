import { Router, Request, Response, NextFunction } from "express";
import { uploadXLSX } from "../../middleware/upload";

interface IController {
	previewManual(req: Request, res: Response, next: NextFunction): Promise<void>;
	previewImport(req: Request, res: Response, next: NextFunction): Promise<void>;
	createRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	listRuns(req: Request, res: Response, next: NextFunction): Promise<void>;
	getRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	releaseRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	cancelRun(req: Request, res: Response, next: NextFunction): Promise<void>;
	listRunPayslips(req: Request, res: Response, next: NextFunction): Promise<void>;
	getPayslip(req: Request, res: Response, next: NextFunction): Promise<void>;
	listMyReleasedPayslips(req: Request, res: Response, next: NextFunction): Promise<void>;
	downloadTemplate(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/special-payroll";

	/**
	 * @openapi
	 * /api/special-payroll/preview:
	 *   post:
	 *     summary: Preview Special Payroll manual rows without writing
	 *     tags: [SpecialPayroll]
	 */
	routes.post(`${path}/preview`, controller.previewManual);

	/**
	 * @openapi
	 * /api/special-payroll/import/preview:
	 *   post:
	 *     summary: Preview Special Payroll from .xlsx without writing
	 *     tags: [SpecialPayroll]
	 */
	routes.post(`${path}/import/preview`, uploadXLSX, controller.previewImport);

	/**
	 * @openapi
	 * /api/special-payroll/runs:
	 *   post:
	 *     summary: Create immutable Special Payroll run from confirmed preview
	 *     tags: [SpecialPayroll]
	 *   get:
	 *     summary: List Special Payroll runs
	 *     tags: [SpecialPayroll]
	 */
	routes.post(`${path}/runs`, controller.createRun);
	routes.get(`${path}/runs`, controller.listRuns);

	routes.get(`${path}/template`, controller.downloadTemplate);
	routes.get(`${path}/my-payslips`, controller.listMyReleasedPayslips);

	routes.get(`${path}/runs/:id`, controller.getRun);
	routes.post(`${path}/runs/:id/release`, controller.releaseRun);
	routes.post(`${path}/runs/:id/cancel`, controller.cancelRun);
	routes.get(`${path}/runs/:id/payslips`, controller.listRunPayslips);

	/**
	 * @openapi
	 * /api/special-payroll/payslips/{id}:
	 *   get:
	 *     summary: Special payslip detail or PDF (?format=pdf)
	 *     tags: [SpecialPayroll]
	 */
	routes.get(`${path}/payslips/:id`, controller.getPayslip);

	route.use(routes);
	return route;
};
