import path from "path";

export const resolveProjectTruthRuntimeRoot = (
	env: NodeJS.ProcessEnv = process.env,
	cwd = process.cwd(),
) => {
	const configured = String(env.PROJECT_TRUTH_RUNTIME_ROOT || "").trim();
	if (configured) return path.resolve(configured);

	const uploadRoot = String(env.LOCAL_UPLOAD_ROOT || "").trim();
	if (uploadRoot) return path.resolve(uploadRoot, ".runtime");

	return path.resolve(cwd, "..", ".runtime");
};
