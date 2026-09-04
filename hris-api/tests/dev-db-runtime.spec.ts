import { expect } from "chai";
import fs from "fs";
import path from "path";

const runtimeHelper = require("../scripts/dev-db-runtime.cjs");

describe("dev DB runtime resolver", () => {
	it("infers the dev environment for the canonical K3s DEV forward port 55435", () => {
		const datasource = runtimeHelper.parseDatasourceUrl(
			"postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public",
		);

		expect(runtimeHelper.inferEnvironment(datasource)).to.equal("dev");
	});

	it("prefers a reachable alternate Project Truth VM IP when the configured host is stale", async () => {
		const datasource = runtimeHelper.parseDatasourceUrl(
			"postgresql://postgres:postgres@10.184.37.241:15433/hris?schema=public",
		);

		const result = await runtimeHelper.resolvePreferredDatasource({
			datasource,
			envMap: {
				PROJECT_TRUTH_DEV_PG_DATABASE_URL:
					"postgresql://postgres:postgres@10.184.37.241:15433/hris?schema=public",
			},
			canConnect: async (port: number, host: string) => host === "10.184.37.19" && port === 15433,
		});

		expect(result.resolution).to.equal("discovered-remote");
		expect(result.selectedDatasource.raw).to.equal(
			"postgresql://postgres:postgres@10.184.37.19:15433/hris?schema=public",
		);
		expect(result.selectedVmHost).to.equal("10.184.37.19");
		expect(result.needsBnpiForward).to.equal(false);
	});

	it("falls back to the localhost Cloudflare DB forward when no known VM IP answers", async () => {
		const datasource = runtimeHelper.parseDatasourceUrl(
			"postgresql://postgres:postgres@10.184.37.241:15433/hris?schema=public",
		);

		const result = await runtimeHelper.resolvePreferredDatasource({
			datasource,
			envMap: {},
			canConnect: async () => false,
		});

		expect(result.resolution).to.equal("start-local-forward");
		expect(result.selectedDatasource.raw).to.equal(
			"postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public",
		);
		expect(result.needsBnpiForward).to.equal(true);
	});

	it("loads the generated runtime override file during dev startup", () => {
		const repoRoot = path.resolve(__dirname, "..");
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
		) as { scripts: Record<string, string> };
		const localServicesScript = fs.readFileSync(
			path.join(repoRoot, "scripts", "ensure-local-dev-services.cjs"),
			"utf8",
		);

		expect(packageJson.scripts.dev).to.contain("-o -e .env -e .env.development.local");
		expect(packageJson.scripts["dev:api-only"]).to.contain("-o -e .env -e .env.development.local");
		expect(localServicesScript).to.contain("loadEnvFile(runtimeEnvPath, { overwrite: true });");
	});
});
