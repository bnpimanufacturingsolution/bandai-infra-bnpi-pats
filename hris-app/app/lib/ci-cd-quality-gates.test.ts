import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const readText = (...segments: string[]) => readFileSync(join(root, ...segments), "utf8");

const workflowPath = [".github", "workflows", "firebase-hosting-develop.yml"] as const;

describe("CI/CD quality gate wiring", () => {
	it("defines a canonical deployable quality gate without mutating lint", () => {
		const pkg = JSON.parse(readText("package.json"));

		expect(pkg.scripts.lint).toBe("eslint .");
		expect(pkg.scripts["lint:fix"]).toBe("eslint . --fix");
		expect(pkg.scripts["test:obligations"]).toBe("node scripts/check-test-obligations.mjs");
		expect(pkg.scripts["test:e2e:smoke"]).toBe(
			"playwright test -c playwright.smoke.config.ts",
		);
		expect(pkg.scripts["quality:ci"]).toBe(
			"npm run test:obligations && npm run test:ci && npm run test:e2e:smoke && npm run build",
		);
		expect(pkg.scripts["quality:strict"]).toContain("npm run lint");
		expect(pkg.scripts["quality:strict"]).toContain("npm run typecheck");
		expect(pkg.scripts["clean-unreachable-routes"]).toBe(
			"tsx scripts/clean-unreachable-routes.ts",
		);
		expect(readText("eslint.config.js")).toContain("eslint-config-prettier");
	});

	it("defines a single consolidated pipeline for develop and uat", () => {
		const workflow = readText(...workflowPath);

		expect(workflow).toContain("name: Firebase Hosting Pipeline");
		expect(workflow).toContain("pull_request:");
		expect(workflow).toContain("push:");
		expect(workflow).toContain("branches:");
		expect(workflow).toContain("- develop");
		expect(workflow).toContain("- uat");
		expect(workflow).not.toContain("continue-on-error");
	});

	it("splits the pipeline into separate validation and build jobs", () => {
		const workflow = readText(...workflowPath);

		expect(workflow).toContain("test_obligations:");
		expect(workflow).toContain("tests:");
		expect(workflow).toContain("e2e_smoke:");
		expect(workflow).toContain("build:");
		expect(workflow).toContain("Run test obligations");
		expect(workflow).toContain("Run tests");
		expect(workflow).toContain("Run E2E smoke tests");
		expect(workflow).toContain("Build app");
		expect(workflow).toContain("actions/upload-artifact@v4");
		expect(workflow).toContain("needs:");
		expect(workflow).toContain("- test_obligations");
		expect(workflow).toContain("- tests");
		expect(workflow).toContain("- e2e_smoke");
		expect(workflow).not.toContain("CI: false");
	});

	it("gates Firebase previews before publishing a preview channel", () => {
		const workflow = readText(...workflowPath);
		const buildIndex = workflow.indexOf("build:");
		const previewIndex = workflow.indexOf("deploy_preview:");
		const deployHostingIndex = workflow.indexOf("deploy_hosting:");
		const artifactUploadIndex = workflow.indexOf("Upload Firebase build artifact");
		const artifactDownloadIndex = workflow.indexOf("Download Firebase preview build artifact");
		const verifyBuildIndex = workflow.indexOf("Verify hosting build output");
		const resolveSiteIndex = workflow.indexOf("Resolve Hosting Site From Target");
		const verifyConfigIndex = workflow.indexOf("Verify preview config hosting path");
		const deployIndex = workflow.indexOf("Deploy preview channel");
		const previewSection = workflow.slice(
			previewIndex,
			deployHostingIndex > -1 ? deployHostingIndex : workflow.length,
		);

		expect(buildIndex).toBeGreaterThan(-1);
		expect(previewIndex).toBeGreaterThan(buildIndex);
		expect(artifactUploadIndex).toBeGreaterThan(buildIndex);
		expect(artifactDownloadIndex).toBeGreaterThan(previewIndex);
		expect(verifyBuildIndex).toBeGreaterThan(artifactDownloadIndex);
		expect(resolveSiteIndex).toBeGreaterThan(verifyBuildIndex);
		expect(verifyConfigIndex).toBeGreaterThan(resolveSiteIndex);
		expect(deployIndex).toBeGreaterThan(verifyConfigIndex);
		expect(previewSection).toContain("needs: build");
		expect(workflow).toContain("actions/upload-artifact@v4");
		expect(previewSection).toContain("actions/download-artifact@v4");
		expect(workflow).toContain("if-no-files-found: error");
		expect(previewSection).toContain("build/client/index.html");
		expect(previewSection).toContain(
			"FIREBASE_PREVIEW_CONFIG=$GITHUB_WORKSPACE/.firebase-hosting-preview.json",
		);
		expect(previewSection).toContain("path.dirname(configPath)");
		expect(previewSection).not.toContain("$RUNNER_TEMP/firebase-hosting-preview.json");
		expect(previewSection).toContain("SA_PROJECT_ID");
		expect(previewSection).toContain("Resolve Hosting Site From Target");
		expect(previewSection).toContain("FIREBASE_SITE_ID");
		expect(previewSection).toContain("firebase-hosting-preview.json");
		expect(previewSection).toContain('--config "$FIREBASE_PREVIEW_CONFIG"');
		expect(previewSection).toContain("hosting:channel:deploy");
		expect(previewSection).not.toContain('--only "hosting:$FIREBASE_TARGET"');
	});

	it("deploys Firebase Hosting only from branch pushes after build", () => {
		const workflow = readText(...workflowPath);
		const buildIndex = workflow.indexOf("build:");
		const deployIndex = workflow.indexOf("deploy_hosting:");

		expect(deployIndex).toBeGreaterThan(buildIndex);
		expect(workflow).toContain("name: Deploy to Firebase Hosting");
		expect(workflow).toContain("if: ${{ github.event_name != 'pull_request'");
		expect(workflow).toContain("needs: build");
		expect(workflow).toContain("Download Firebase build artifact");
		expect(workflow).toContain('--only "hosting:$FIREBASE_TARGET"');
	});
});
