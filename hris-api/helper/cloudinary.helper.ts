import { UploadApiResponse, UploadApiErrorResponse } from "cloudinary";
import { Client as MinioClient } from "minio";
import fs from "fs/promises";
import path from "path";
import { getLogger } from "./logger.helper";
import { cloudinary, cloudinaryConfig } from "../config/cloudinary";

const logger = getLogger();
const cloudinaryLogger = logger.child({ module: "cloudinary" });
const minioLogger = logger.child({ module: "minio" });
const localStorageLogger = logger.child({ module: "local-storage" });

type StorageProvider = "cloudinary" | "minio" | "gcp" | "local";

function resolveStorageProvider(): StorageProvider {
	const rawProvider = (process.env.STORAGE_PROVIDER || "local").toLowerCase().trim();

	switch (rawProvider) {
		case "":
		case "local":
		case "file":
		case "disk":
		case "filesystem":
			return "local";
		case "minio":
			return "minio";
		case "gcp":
		case "gcs":
		case "google":
		case "google-cloud-storage":
			return "gcp";
		case "cloudinary":
			return "cloudinary";
		default:
			cloudinaryLogger.warn(
				`Unknown STORAGE_PROVIDER="${rawProvider}". Falling back to local storage.`,
			);
			return "local";
	}
}

let minioClient: MinioClient | null = null;

export type CloudinaryUploadResult = {
	success: boolean;
	url?: string;
	secureUrl?: string;
	publicId?: string;
	width?: number;
	height?: number;
	format?: string;
	bytes?: number;
	error?: string;
};

export type CloudinaryUploadOptions = {
	folder?: string;
	publicId?: string;
	transformation?: {
		width?: number;
		height?: number;
		crop?: string;
		quality?: string | number;
	};
	resourceType?: "image" | "video" | "raw" | "auto";
	overwrite?: boolean;
};

const DEFAULT_CLOUDINARY_RETRY_ATTEMPTS = 2;
const DEFAULT_CLOUDINARY_RETRY_DELAY_MS = 750;

type MinioConfig = {
	endPoint: string;
	port: number;
	useSSL: boolean;
	accessKey: string;
	secretKey: string;
	bucket: string;
	publicBaseUrl: string;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function getMinioConfig(): MinioConfig {
	const port = Number(process.env.MINIO_PORT || "9000");
	return {
		endPoint: process.env.MINIO_ENDPOINT || "localhost",
		port: Number.isNaN(port) ? 9000 : port,
		useSSL: parseBoolean(process.env.MINIO_USE_SSL, false),
		accessKey: process.env.MINIO_ACCESS_KEY || "",
		secretKey: process.env.MINIO_SECRET_KEY || "",
		bucket: process.env.MINIO_BUCKET || "hris-images",
		publicBaseUrl:
			process.env.MINIO_PUBLIC_BASE_URL ||
			`${parseBoolean(process.env.MINIO_USE_SSL, false) ? "https" : "http"}://${process.env.MINIO_ENDPOINT || "localhost"}:${process.env.MINIO_PORT || "9000"}`,
	};
}

function isMinioConfigured(config: MinioConfig): boolean {
	return !!(config.endPoint && config.accessKey && config.secretKey && config.bucket);
}

function getMinioClient(config: MinioConfig): MinioClient {
	if (minioClient) return minioClient;
	minioClient = new MinioClient({
		endPoint: config.endPoint,
		port: config.port,
		useSSL: config.useSSL,
		accessKey: config.accessKey,
		secretKey: config.secretKey,
	});
	return minioClient;
}

function normalizePublicId(raw: string): string {
	return raw.replace(/^\/+|\/+$/g, "");
}

function encodeObjectPath(path: string): string {
	return path
		.split("/")
		.filter(Boolean)
		.map((part) => encodeURIComponent(part))
		.join("/");
}

function generateObjectKey(folder: string, publicId?: string): string {
	const normalizedFolder = normalizePublicId(folder || "uploads");
	if (publicId) {
		return normalizePublicId(`${normalizedFolder}/${normalizePublicId(publicId)}`);
	}
	const randomSuffix = Math.random().toString(36).slice(2, 10);
	return `${normalizedFolder}/${Date.now()}-${randomSuffix}`;
}

function getLocalUploadsRoot(): string {
	return process.env.LOCAL_UPLOAD_ROOT || path.resolve(process.cwd(), "uploads");
}

function getLocalPublicBaseUrl(): string {
	return (process.env.LOCAL_UPLOAD_PUBLIC_BASE_URL || process.env.API_PUBLIC_BASE_URL || "").replace(
		/\/+$/,
		"",
	);
}

function normalizeLocalObjectKey(raw: string): string {
	return normalizePublicId(raw)
		.split("/")
		.filter(Boolean)
		.map((segment) => segment.replace(/[^a-zA-Z0-9._-]+/g, "_"))
		.join("/");
}

function getLocalObjectUrl(objectKey: string): string {
	const publicPath = `/uploads/${encodeObjectPath(objectKey)}`;
	const base = getLocalPublicBaseUrl();
	return base ? `${base}${publicPath}` : publicPath;
}

async function uploadToLocalStorage(
	buffer: Buffer,
	options: CloudinaryUploadOptions = {},
): Promise<CloudinaryUploadResult> {
	const { folder = "uploads", publicId } = options;
	const objectKey = normalizeLocalObjectKey(generateObjectKey(folder, publicId));
	if (!objectKey) {
		return { success: false, error: "Invalid local upload object key" };
	}

	const uploadsRoot = getLocalUploadsRoot();
	const targetPath = path.join(uploadsRoot, objectKey);

	try {
		await fs.mkdir(path.dirname(targetPath), { recursive: true });
		await fs.writeFile(targetPath, buffer);

		const objectUrl = getLocalObjectUrl(objectKey);
		localStorageLogger.info(`File uploaded successfully: ${objectKey}`);

		return {
			success: true,
			url: objectUrl,
			secureUrl: objectUrl,
			publicId: `local/${objectKey}`,
			bytes: buffer.length,
		};
	} catch (error: any) {
		localStorageLogger.error(`Local upload failed: ${error.message}`);
		return {
			success: false,
			error: error.message,
		};
	}
}

async function uploadToMinio(
	buffer: Buffer,
	options: CloudinaryUploadOptions = {},
): Promise<CloudinaryUploadResult> {
	const config = getMinioConfig();
	if (!isMinioConfigured(config)) {
		minioLogger.error("MinIO is not configured. Check environment variables.");
		return { success: false, error: "MinIO is not configured" };
	}

	const { folder = "uploads", publicId, resourceType = "auto" } = options;
	const objectKey = generateObjectKey(folder, publicId);
	const client = getMinioClient(config);

	try {
		await client.putObject(config.bucket, objectKey, buffer, buffer.length, {
			"Content-Type":
				resourceType === "image"
					? "image/*"
					: resourceType === "video"
						? "video/*"
						: "application/octet-stream",
		});

		const base = config.publicBaseUrl.replace(/\/+$/, "");
		const objectUrl = `${base}/${encodeURIComponent(config.bucket)}/${encodeObjectPath(objectKey)}`;
		minioLogger.info(`File uploaded successfully: ${config.bucket}/${objectKey}`);

		return {
			success: true,
			url: objectUrl,
			secureUrl: objectUrl,
			publicId: `${config.bucket}/${objectKey}`,
			bytes: buffer.length,
		};
	} catch (error: any) {
		minioLogger.error(`MinIO upload failed: ${error.message}`);
		return {
			success: false,
			error: error.message,
		};
	}
}

/**
 * Upload a single image buffer to Cloudinary
 */
export async function uploadToCloudinary(
	buffer: Buffer,
	options: CloudinaryUploadOptions = {},
): Promise<CloudinaryUploadResult> {
	const provider = resolveStorageProvider();

	switch (provider) {
		case "local":
			return uploadToLocalStorage(buffer, options);
		case "minio":
			return uploadToMinio(buffer, options);
		case "gcp":
			cloudinaryLogger.error(
				'STORAGE_PROVIDER is set to "gcp", but GCP storage upload is not implemented in this service yet.',
			);
			return {
				success: false,
				error: "GCP storage provider is not implemented yet",
			};
		case "cloudinary":
			break;
	}

	if (!cloudinaryConfig.isConfigured()) {
		cloudinaryLogger.error("Cloudinary is not configured. Check environment variables.");
		return {
			success: false,
			error: "Cloudinary is not configured",
		};
	}

	const {
		folder = "uploads",
		publicId,
		transformation,
		resourceType = "image",
		overwrite = true,
	} = options;

	const shouldRetryUpload = (result: CloudinaryUploadResult) => {
		const message = String(result.error || "").toLowerCase();
		return (
			message.includes("timeout") ||
			message.includes("econnreset") ||
			message.includes("etimedout") ||
			message.includes("socket hang up") ||
			message.includes("network")
		);
	};

	const uploadOnce = () =>
		new Promise<CloudinaryUploadResult>((resolve) => {
			const uploadOptions: Record<string, unknown> = {
				folder,
				resource_type: resourceType,
				overwrite,
				disable_promises: true,
			};

			let settled = false;
			const finish = (result: CloudinaryUploadResult) => {
				if (settled) return;
				settled = true;
				resolve(result);
			};

			if (publicId) {
				uploadOptions.public_id = publicId;
			}

			if (transformation) {
				uploadOptions.transformation = transformation;
			}

			const uploadStream = cloudinary.uploader.upload_stream(
				uploadOptions,
				(error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
					if (error) {
						cloudinaryLogger.error(`Cloudinary upload failed: ${error.message}`);
						finish({
							success: false,
							error: error.message,
						});
						return;
					}

					if (!result) {
						cloudinaryLogger.error("Cloudinary upload returned no result");
						finish({
							success: false,
							error: "Upload returned no result",
						});
						return;
					}

					cloudinaryLogger.info(`Image uploaded successfully: ${result.public_id}`);
					finish({
						success: true,
						url: result.url,
						secureUrl: result.secure_url,
						publicId: result.public_id,
						width: result.width,
						height: result.height,
						format: result.format,
						bytes: result.bytes,
					});
				},
			);

			uploadStream.once("error", (error: any) => {
				const message = error?.message || String(error);
				cloudinaryLogger.error(`Cloudinary upload stream failed: ${message}`);
				finish({
					success: false,
					error: message,
				});
			});

			try {
				uploadStream.end(buffer);
			} catch (error: any) {
				const message = error?.message || String(error);
				cloudinaryLogger.error(`Cloudinary upload stream write failed: ${message}`);
				finish({
					success: false,
					error: message,
				});
			}
		});

	let attempt = 0;
	let lastResult: CloudinaryUploadResult | null = null;
	while (attempt < DEFAULT_CLOUDINARY_RETRY_ATTEMPTS) {
		attempt += 1;
		lastResult = await uploadOnce();
		if (lastResult.success || !shouldRetryUpload(lastResult)) {
			return lastResult;
		}

		if (attempt < DEFAULT_CLOUDINARY_RETRY_ATTEMPTS) {
			cloudinaryLogger.warn(
				`Retrying Cloudinary upload after transient failure (${attempt}/${DEFAULT_CLOUDINARY_RETRY_ATTEMPTS}): ${lastResult.error}`,
			);
			await new Promise((resolve) => setTimeout(resolve, DEFAULT_CLOUDINARY_RETRY_DELAY_MS));
		}
	}

	return lastResult || { success: false, error: "Cloudinary upload failed" };
}

/**
 * Upload multiple image buffers to Cloudinary
 */
export async function uploadMultipleToCloudinary(
	files: { buffer: Buffer; originalname: string }[],
	options: CloudinaryUploadOptions = {},
): Promise<CloudinaryUploadResult[]> {
	const uploadPromises = files.map((file, index) => {
		const fileOptions = {
			...options,
			publicId: options.publicId ? `${options.publicId}_${index}` : undefined,
		};
		return uploadToCloudinary(file.buffer, fileOptions);
	});

	return Promise.all(uploadPromises);
}

/**
 * Delete an image from Cloudinary by public ID
 */
export async function deleteFromCloudinary(
	publicId: string,
	options: { resourceType?: "image" | "video" | "raw" } = {},
): Promise<boolean> {
	const provider = resolveStorageProvider();

	switch (provider) {
		case "local": {
			try {
				const normalized = normalizePublicId(publicId).replace(/^local\//, "");
				const objectKey = normalizeLocalObjectKey(normalized);
				if (!objectKey) return false;
				await fs.unlink(path.join(getLocalUploadsRoot(), objectKey));
				localStorageLogger.info(`File deleted successfully: ${objectKey}`);
				return true;
			} catch (error: any) {
				if (error?.code === "ENOENT") {
					localStorageLogger.warn(`File deletion returned: not found for ${publicId}`);
				} else {
					localStorageLogger.error(`Failed to delete file ${publicId}: ${error.message}`);
				}
				return false;
			}
		}
		case "minio": {
			const config = getMinioConfig();
			if (!isMinioConfigured(config)) {
				minioLogger.error("MinIO is not configured. Check environment variables.");
				return false;
			}

			try {
				const normalized = normalizePublicId(publicId);
				let bucket = config.bucket;
				let objectKey = normalized;
				const slash = normalized.indexOf("/");
				if (slash > 0) {
					bucket = normalized.slice(0, slash);
					objectKey = normalized.slice(slash + 1);
				}

				await getMinioClient(config).removeObject(bucket, objectKey);
				minioLogger.info(`File deleted successfully: ${bucket}/${objectKey}`);
				return true;
			} catch (error: any) {
				minioLogger.error(`Failed to delete file ${publicId}: ${error.message}`);
				return false;
			}
		}
		case "gcp":
			cloudinaryLogger.error(
				'STORAGE_PROVIDER is set to "gcp", but GCP storage delete is not implemented in this service yet.',
			);
			return false;
		case "cloudinary":
			break;
	}

	if (!cloudinaryConfig.isConfigured()) {
		cloudinaryLogger.error("Cloudinary is not configured. Check environment variables.");
		return false;
	}

	try {
		const resourceTypes = options.resourceType
			? [options.resourceType]
			: (["image", "raw", "video"] as const);

		for (const resourceType of resourceTypes) {
			const result = await cloudinary.uploader.destroy(publicId, {
				resource_type: resourceType,
			});

			if (result.result === "ok") {
				cloudinaryLogger.info(`File deleted successfully: ${publicId}`);
				return true;
			}

			if (result.result !== "not found") {
				cloudinaryLogger.warn(
					`File deletion returned: ${result.result} for ${publicId} (${resourceType})`,
				);
				return false;
			}
		}

		cloudinaryLogger.warn(`File deletion returned: not found for ${publicId}`);
		return false;
	} catch (error: any) {
		cloudinaryLogger.error(`Failed to delete file ${publicId}: ${error.message}`);
		return false;
	}
}

/**
 * Delete multiple images from Cloudinary
 */
export async function deleteMultipleFromCloudinary(publicIds: string[]): Promise<{
	deleted: string[];
	failed: string[];
}> {
	const results = await Promise.all(
		publicIds.map(async (publicId) => ({
			publicId,
			success: await deleteFromCloudinary(publicId),
		})),
	);

	return {
		deleted: results.filter((r) => r.success).map((r) => r.publicId),
		failed: results.filter((r) => !r.success).map((r) => r.publicId),
	};
}

/**
 * Extract public ID from a Cloudinary URL
 * Example: https://res.cloudinary.com/xxx/image/upload/v123/folder/subfolder/filename.jpg
 * Returns: folder/subfolder/filename
 */
export function extractPublicIdFromUrl(url: string): string | null {
	const provider = resolveStorageProvider();
	switch (provider) {
		case "local":
			try {
				const parsed = new URL(url, "http://local.invalid");
				const prefix = "/uploads/";
				if (!parsed.pathname.startsWith(prefix)) return null;
				return `local/${decodeURIComponent(parsed.pathname.slice(prefix.length))}`;
			} catch {
				return null;
			}
		case "minio":
			try {
				const parsed = new URL(url);
				const pathParts = parsed.pathname.split("/").filter(Boolean);
				if (pathParts.length < 2) return null;
				const [bucket, ...rest] = pathParts;
				return `${bucket}/${rest.join("/")}`;
			} catch {
				return null;
			}
		case "gcp":
			cloudinaryLogger.warn(
				'STORAGE_PROVIDER is set to "gcp", but GCP public id extraction is not implemented yet.',
			);
			return null;
		case "cloudinary":
			break;
	}

	try {
		// Match the pattern after /upload/v{version}/ or /upload/
		const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
		if (match && match[1]) {
			// Remove the file extension
			const publicIdWithExt = match[1];
			const lastDotIndex = publicIdWithExt.lastIndexOf(".");
			if (lastDotIndex > 0) {
				return publicIdWithExt.substring(0, lastDotIndex);
			}
			return publicIdWithExt;
		}
		return null;
	} catch (error) {
		return null;
	}
}

/**
 * Generate a Cloudinary URL with transformations
 */
export function getCloudinaryUrl(
	publicId: string,
	options: {
		width?: number;
		height?: number;
		crop?: string;
		quality?: string | number;
		format?: string;
	} = {},
): string {
	const provider = resolveStorageProvider();
	switch (provider) {
		case "local": {
			const normalized = normalizePublicId(publicId).replace(/^local\//, "");
			return getLocalObjectUrl(normalizeLocalObjectKey(normalized));
		}
		case "minio": {
			const config = getMinioConfig();
			const base = config.publicBaseUrl.replace(/\/+$/, "");
			const normalized = normalizePublicId(publicId);
			const slash = normalized.indexOf("/");
			const bucket = slash > 0 ? normalized.slice(0, slash) : config.bucket;
			const objectKey = slash > 0 ? normalized.slice(slash + 1) : normalized;
			return `${base}/${encodeURIComponent(bucket)}/${encodeObjectPath(objectKey)}`;
		}
		case "gcp":
			cloudinaryLogger.warn(
				'STORAGE_PROVIDER is set to "gcp", but GCP URL generation is not implemented yet.',
			);
			return "";
		case "cloudinary":
			break;
	}

	if (!cloudinaryConfig.isConfigured()) {
		return "";
	}

	return cloudinary.url(publicId, {
		secure: true,
		...options,
	});
}
