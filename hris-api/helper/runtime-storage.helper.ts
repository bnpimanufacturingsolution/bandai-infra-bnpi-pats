import path from "path";
import os from "os";

export const resolveProjectTruthRuntimeRoot = (
	env: NodeJS.ProcessEnv = process.env,
	cwd = process.cwd(),
) => {
	const configured = String(env.PROJECT_TRUTH_RUNTIME_ROOT || "").trim();
	if (configured) return path.resolve(configured);

	const uploadRoot = String(env.LOCAL_UPLOAD_ROOT || "").trim();
	if (uploadRoot) return path.resolve(uploadRoot, ".runtime");

	// In container images cwd is often /app; cwd/../.runtime becomes /.runtime (not writable).
	const basename = path.basename(cwd).toLowerCase();
	if (
		basename === "app" ||
		cwd === "/" ||
		cwd === path.parse(cwd).root ||
		String(env.KUBERNETES_SERVICE_HOST || "").trim()
	) {
		return path.join(os.tmpdir(), "project-truth-runtime");
	}

	return path.resolve(cwd, "..", ".runtime");
};
