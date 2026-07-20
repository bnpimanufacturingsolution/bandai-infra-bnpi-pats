import path from "node:path";

const LOCAL_UPLOAD_URL_PREFIX = "/uploads/";

export const getLocalUploadsRoot = () =>
	path.resolve(process.env.LOCAL_UPLOAD_ROOT || path.resolve(process.cwd(), "uploads"));

export const resolveLocalUploadPath = (fileUrl: string): string | null => {
	if (!fileUrl.startsWith(LOCAL_UPLOAD_URL_PREFIX)) return null;

	const relativePath = decodeURIComponent(fileUrl.slice(LOCAL_UPLOAD_URL_PREFIX.length));
	const uploadRoot = getLocalUploadsRoot();
	const resolvedPath = path.resolve(uploadRoot, relativePath);
	const rootWithSeparator = uploadRoot.endsWith(path.sep) ? uploadRoot : `${uploadRoot}${path.sep}`;

	if (resolvedPath !== uploadRoot && !resolvedPath.startsWith(rootWithSeparator)) {
		throw new Error("Invalid local upload path");
	}

	return resolvedPath;
};
