import fs from "fs";
import path from "path";
import YAML from "yaml";
import buildSpec from "../docs/openApiSpecs";

function ensureDirExists(dirPath: string) {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
}

function run() {
	const outputDir = path.resolve(process.cwd(), "docs", "generated");
	ensureDirExists(outputDir);

	const spec = buildSpec();

	const jsonPath = path.join(outputDir, "swagger.json");
	const yamlPath = path.join(outputDir, "swagger.yaml");

	fs.writeFileSync(jsonPath, JSON.stringify(spec, null, 2));
	fs.writeFileSync(yamlPath, YAML.stringify(spec));

	console.log(`Wrote OpenAPI spec to ${jsonPath} and ${yamlPath}`);
}

run();
