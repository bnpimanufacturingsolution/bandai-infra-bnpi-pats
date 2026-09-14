import { Router, Request, Response, NextFunction } from "express";

interface IController {
	getRoster(req: Request, res: Response, next: NextFunction): Promise<void>;
	listTemplates(req: Request, res: Response, next: NextFunction): Promise<void>;
	getTemplate(req: Request, res: Response, next: NextFunction): Promise<void>;
	createTemplate(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateTemplate(req: Request, res: Response, next: NextFunction): Promise<void>;
	deleteTemplate(req: Request, res: Response, next: NextFunction): Promise<void>;
	createTemplateSection(req: Request, res: Response, next: NextFunction): Promise<void>;
	createTemplateItem(req: Request, res: Response, next: NextFunction): Promise<void>;
	bulkCreateTemplateItems(req: Request, res: Response, next: NextFunction): Promise<void>;
	replaceTemplateTree(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateSection(req: Request, res: Response, next: NextFunction): Promise<void>;
	deleteSection(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateItem(req: Request, res: Response, next: NextFunction): Promise<void>;
	deleteItem(req: Request, res: Response, next: NextFunction): Promise<void>;
	listChecklists(req: Request, res: Response, next: NextFunction): Promise<void>;
	createChecklist(req: Request, res: Response, next: NextFunction): Promise<void>;
	provisionAllChecklists(req: Request, res: Response, next: NextFunction): Promise<void>;
	getChecklist(req: Request, res: Response, next: NextFunction): Promise<void>;
	getVisibleChecklist(req: Request, res: Response, next: NextFunction): Promise<void>;
	updateChecklist(req: Request, res: Response, next: NextFunction): Promise<void>;
	deleteChecklist(req: Request, res: Response, next: NextFunction): Promise<void>;
	createChecklistSection(req: Request, res: Response, next: NextFunction): Promise<void>;
	createChecklistItem(req: Request, res: Response, next: NextFunction): Promise<void>;
	bulkCreateChecklistItems(req: Request, res: Response, next: NextFunction): Promise<void>;
	signItem(req: Request, res: Response, next: NextFunction): Promise<void>;
	unsignItem(req: Request, res: Response, next: NextFunction): Promise<void>;
	listItemSignatures(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export const router = (route: Router, controller: IController): Router => {
	const routes = Router();
	const path = "/onboarding";

	/**
	 * @openapi
	 * /api/onboarding/employees:
	 *   get:
	 *     summary: List ONBOARDING employees with checklist summary
	 *     description: Roster of onboarding employees. Readable by any authenticated employee.
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Onboarding employees retrieved
	 *       401:
	 *         $ref: '#/components/responses/Unauthorized'
	 */
	routes.get("/employees", controller.getRoster);

	/**
	 * @openapi
	 * /api/onboarding/templates:
	 *   get:
	 *     summary: List onboarding checklist templates (admin/HR)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Templates retrieved
	 *   post:
	 *     summary: Create onboarding checklist template (admin)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       201:
	 *         description: Template created
	 */
	routes.get("/templates", controller.listTemplates);
	routes.post("/templates", controller.createTemplate);

	/**
	 * @openapi
	 * /api/onboarding/templates/{id}:
	 *   get:
	 *     summary: Get template with full section/item tree (admin/HR)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *   patch:
	 *     summary: Update template header (admin)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *   delete:
	 *     summary: Soft delete template (admin)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.get("/templates/:id", controller.getTemplate);
	routes.patch("/templates/:id", controller.updateTemplate);
	routes.delete("/templates/:id", controller.deleteTemplate);

	/**
	 * @openapi
	 * /api/onboarding/templates/{id}/sections:
	 *   post:
	 *     summary: Add template section (admin)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.post("/templates/:id/sections", controller.createTemplateSection);

	/**
	 * @openapi
	 * /api/onboarding/templates/{id}/items:
	 *   post:
	 *     summary: Add template item (admin). sectionId required; parentId optional.
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.post("/templates/:id/items", controller.createTemplateItem);
	routes.post("/templates/:id/items/bulk", controller.bulkCreateTemplateItems);

	/**
	 * @openapi
	 * /api/onboarding/templates/{id}/tree:
	 *   put:
	 *     summary: Replace full template tree in one transaction (admin, builder save-all)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.put("/templates/:id/tree", controller.replaceTemplateTree);

	/**
	 * @openapi
	 * /api/onboarding/checklists:
	 *   get:
	 *     summary: List checklist instances (admin/HR)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *   post:
	 *     summary: Instantiate checklist for an employee, deep-copied from a template (admin/HR)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.get("/checklists", controller.listChecklists);
	routes.post("/checklists", controller.createChecklist);

	/**
	 * @openapi
	 * /api/onboarding/checklists/provision-all:
	 *   post:
	 *     summary: "Provision checklists for ONBOARDING employees missing one (admin/HR). Body: { dryRun?, employeeIds? }"
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *     responses:
	 *       200:
	 *         description: Provisioning plan or result
	 */
	routes.post("/checklists/provision-all", controller.provisionAllChecklists);

	/**
	 * @openapi
	 * /api/onboarding/checklists/{id}:
	 *   get:
	 *     summary: Full checklist tree (admin/HR)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *   patch:
	 *     summary: Update checklist header (admin/HR)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *   delete:
	 *     summary: Soft delete checklist (admin/HR)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.get("/checklists/:id", controller.getChecklist);
	routes.patch("/checklists/:id", controller.updateChecklist);
	routes.delete("/checklists/:id", controller.deleteChecklist);

	/**
	 * @openapi
	 * /api/onboarding/checklists/{id}/visible:
	 *   get:
	 *     summary: Checklist filtered for the caller (admin/HR/self see all; dept employees see own-dept items + no-dept context, with canSign flags)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.get("/checklists/:id/visible", controller.getVisibleChecklist);

	routes.post("/checklists/:id/sections", controller.createChecklistSection);
	routes.post("/checklists/:id/items", controller.createChecklistItem);
	routes.post("/checklists/:id/items/bulk", controller.bulkCreateChecklistItems);

	/**
	 * @openapi
	 * /api/onboarding/sections/{id}:
	 *   patch:
	 *     summary: "Update section (template requires admin; checklist requires admin/HR)"
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *   delete:
	 *     summary: Soft delete section + its items
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.patch("/sections/:id", controller.updateSection);
	routes.delete("/sections/:id", controller.deleteSection);

	/**
	 * @openapi
	 * /api/onboarding/items/{id}:
	 *   patch:
	 *     summary: Update item structure (never status/signature fields)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *   delete:
	 *     summary: Soft delete item + descendants
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.patch("/items/:id", controller.updateItem);
	routes.delete("/items/:id", controller.deleteItem);

	/**
	 * @openapi
	 * /api/onboarding/items/{id}/sign:
	 *   post:
	 *     summary: Sign checklist item with the caller's own password (no relogin)
	 *     description: bcrypt re-verifies the caller's password, enforces the responsible-department rule (admin/HR may sign any item; onboarded employee may never sign own checklist), stamps the signee server-side, and records a signature audit row.
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required: [password]
	 *             properties:
	 *               password:
	 *                 type: string
	 *               remarks:
	 *                 type: string
	 *     responses:
	 *       200:
	 *         description: Item signed
	 *       401:
	 *         description: Invalid password
	 *       403:
	 *         description: Not the responsible department (or own checklist)
	 *       409:
	 *         description: Already signed / account has no password set
	 */
	routes.post("/items/:id/sign", controller.signItem);

	/**
	 * @openapi
	 * /api/onboarding/items/{id}/unsign:
	 *   post:
	 *     summary: Revert a signed item (admin/HR only)
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.post("/items/:id/unsign", controller.unsignItem);

	/**
	 * @openapi
	 * /api/onboarding/items/{id}/signatures:
	 *   get:
	 *     summary: Signature audit trail for an item
	 *     tags: [Onboarding]
	 *     security:
	 *       - bearerAuth: []
	 */
	routes.get("/items/:id/signatures", controller.listItemSignatures);

	route.use(path, routes);

	return route;
};
