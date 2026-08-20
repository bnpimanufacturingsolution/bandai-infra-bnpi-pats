import fs from "node:fs/promises";
import path from "node:path";

const LOCAL_UPLOAD_URL_PREFIX = "/uploads/";

export const getLocalUploadsRoot = () =>
	path.resolve(process.env.LOCAL_UPLOAD_ROOT || path.resolve(process.cwd(), "uploads"));

const normalizeObjectKey = (objectKey: string): string =>
	objectKey.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

export const toLocalUploadPublicUrl = (objectKey: string): string => {
	const relative = normalizeObjectKey(objectKey);
	return `${LOCAL_UPLOAD_URL_PREFIX}${relative
		.split("/")
		.filter(Boolean)
		.map((part) => encodeURIComponent(part))
		.join("/")}`;
};

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

export const writeLocalUploadFile = async (
	objectKey: string,
	buffer: Buffer,
): Promise<{ url: string; absolutePath: string }> => {
	const url = toLocalUploadPublicUrl(objectKey);
	const absolutePath = resolveLocalUploadPath(url);
	if (!absolutePath) {
		throw new Error("Invalid local upload path");
	}

	await fs.mkdir(path.dirname(absolutePath), { recursive: true });
	await fs.writeFile(absolutePath, buffer);
	return { url, absolutePath };
};

export const deleteLocalUploadFile = async (publicIdOrUrl: string): Promise<boolean> => {
	const url = publicIdOrUrl.startsWith(LOCAL_UPLOAD_URL_PREFIX)
		? publicIdOrUrl
		: toLocalUploadPublicUrl(publicIdOrUrl);
	const absolutePath = resolveLocalUploadPath(url);
	if (!absolutePath) return false;

	try {
		await fs.unlink(absolutePath);
		return true;
	} catch (error: any) {
		if (error?.code === "ENOENT") return false;
		throw error;
	}
};
