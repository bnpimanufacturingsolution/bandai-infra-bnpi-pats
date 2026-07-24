import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

describe("DM4 upload source workbooks route contract", () => {
	it("registers upload-source-workbooks with multipart import middleware", () => {
		const routerPath = path.resolve(
			process.cwd(),
			"app/migration/migration.router.ts",
		);
		const controllerPath = path.resolve(
			process.cwd(),
			"app/migration/migration.controller.ts",
		);
		const routerSource = fs.readFileSync(routerPath, "utf8");
		const controllerSource = fs.readFileSync(controllerPath, "utf8");

		expect(routerSource).to.include('"/dm4/upload-source-workbooks"');
		expect(routerSource).to.include("uploadImportFiles");
		expect(routerSource).to.include("controller.uploadDm4SourceWorkbooks");
		expect(controllerSource).to.include("const uploadDm4SourceWorkbooks");
		expect(controllerSource).to.include(".runtime");
		expect(controllerSource).to.include("dm4-uploads");
		expect(controllerSource).to.include("sourceWorkbookFiles");
	});
});
