import { expect } from "chai";
import path from "path";
import { resolveProjectTruthRuntimeRoot } from "../helper/runtime-storage.helper";

describe("Project Truth runtime storage", () => {
	it("uses the explicitly configured durable runtime root", () => {
		expect(
			resolveProjectTruthRuntimeRoot(
				{
					PROJECT_TRUTH_RUNTIME_ROOT: "/app/uploads/project-truth-runtime",
					LOCAL_UPLOAD_ROOT: "/ignored",
				},
				"/app",
			),
		).to.equal(path.resolve("/app/uploads/project-truth-runtime"));
	});

	it("places runtime evidence below the writable upload volume in K3s", () => {
		expect(
			resolveProjectTruthRuntimeRoot({ LOCAL_UPLOAD_ROOT: "/app/uploads" }, "/app"),
		).to.equal(path.resolve("/app/uploads/.runtime"));
	});

	it("preserves the repo-adjacent fallback outside managed runtimes", () => {
		expect(resolveProjectTruthRuntimeRoot({}, "/workspace/hris-api")).to.equal(
			path.resolve("/workspace/.runtime"),
		);
	});
});
