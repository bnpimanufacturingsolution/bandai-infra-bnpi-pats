import path from "path";
import {
	parseBandaiPayrollWorkbook,
	writeJson,
	writeText,
	writeWorkbookPreviewMarkdown,
} from "../helper/payroll-reconciliation.helper";

const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.resolve(repoRoot, "test-results", "payroll-bandai-analysis");
const workbookArg = process.argv.find((arg) => arg.startsWith("--workbook="))?.split("=")[1];
const passwordArg = process.argv.find((arg) => arg.startsWith("--password="))?.split("=")[1] || "9090";

const analysis = parseBandaiPayrollWorkbook({
	workbookPath: workbookArg,
	password: passwordArg,
	outputDir,
});

writeJson(path.join(outputDir, "payroll-workbook-structure.json"), analysis);
writeText(path.join(outputDir, "payroll-workbook-preview.md"), writeWorkbookPreviewMarkdown(analysis));

console.log(
	JSON.stringify(
		{
			workbookPath: analysis.workbookPath,
			unlockedWorkbookPath: analysis.unlockedWorkbookPath,
			unlock: analysis.unlock,
			sheets: analysis.sheets.map((sheet) => sheet.name),
			detectedCutoff: analysis.detectedCutoff,
			rows: analysis.rows.length,
			artifacts: [
				path.join(outputDir, "payroll-workbook-structure.json"),
				path.join(outputDir, "payroll-workbook-preview.md"),
			],
		},
		null,
		2,
	),
);

