export type DocumentFileKind = "pdf" | "image" | "office" | "other";

export const EMPLOYEE_DOCUMENT_ACCEPT =
	"application/pdf,image/jpeg,image/png,image/webp,image/gif,image/bmp,.pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp";
export const EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS = [
	"pdf",
	"jpg",
	"jpeg",
	"png",
	"webp",
	"gif",
	"bmp",
];
export const EMPLOYEE_DOCUMENT_ALLOWED_MIME_TYPES = [
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/bmp",
];
export const EMPLOYEE_DOCUMENT_MAX_SIZE_MB = 10;
export const EMPLOYEE_DOCUMENT_UPLOAD_COPY = "PDF or image up to 10MB";
export const RECRUITMENT_RESUME_ACCEPT =
	"application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,image/gif,image/bmp,.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,.bmp";
export const RECRUITMENT_RESUME_ALLOWED_EXTENSIONS = [
	"pdf",
	"doc",
	"docx",
	"jpg",
	"jpeg",
	"png",
	"webp",
	"gif",
	"bmp",
];
export const RECRUITMENT_RESUME_ALLOWED_MIME_TYPES = [
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/bmp",
];
export const RECRUITMENT_RESUME_MAX_SIZE_MB = 10;
export const RECRUITMENT_RESUME_UPLOAD_COPY = "PDF, DOC, DOCX, or image up to 10MB";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp"]);
const OFFICE_EXTENSIONS = new Set(["doc", "docx"]);

const normalizeExtension = (value?: string | null) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/^\./, "");

const safeDecodeUriComponent = (value: string) => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

const getExtensionFromPath = (value?: string | null) => {
	if (!value) return "";
	const cleanValue = safeDecodeUriComponent(value.split("?")[0].split("#")[0]);
	const lastSegment = cleanValue.split("/").pop() || "";
	const dotIndex = lastSegment.lastIndexOf(".");
	if (dotIndex === -1) return "";
	return normalizeExtension(lastSegment.slice(dotIndex + 1));
};

const getCloudinaryFormatHint = (url?: string | null) => {
	if (!url) return "";

	const match = url.match(/[?&](?:f|format)=([^&#]+)/i);
	return normalizeExtension(match?.[1]);
};

const isCloudinaryImageUrl = (url?: string | null) => {
	if (!url) return false;

	try {
		const parsedUrl = new URL(url);
		return parsedUrl.hostname.includes("cloudinary.com") && parsedUrl.pathname.includes("/image/");
	} catch {
		return /cloudinary\.com\/.+\/image\//i.test(url);
	}
};

export const detectDocumentFileKind = (params: {
	url?: string | null;
	fileName?: string | null;
	ext?: string | null;
}): DocumentFileKind => {
	const candidates = [
		normalizeExtension(params.ext),
		getExtensionFromPath(params.fileName),
		getExtensionFromPath(params.url),
		getCloudinaryFormatHint(params.url),
	].filter(Boolean);

	for (const candidate of candidates) {
		if (candidate === "pdf") return "pdf";
		if (IMAGE_EXTENSIONS.has(candidate)) return "image";
		if (OFFICE_EXTENSIONS.has(candidate)) return "office";
	}

	if (isCloudinaryImageUrl(params.url)) return "image";

	return "other";
};

export const validateEmployeeDocumentFile = (file: File) => {
	if (file.size > EMPLOYEE_DOCUMENT_MAX_SIZE_MB * 1024 * 1024) {
		return `File must be ${EMPLOYEE_DOCUMENT_UPLOAD_COPY}.`;
	}

	const extension = normalizeExtension(file.name.split(".").pop());
	const hasAllowedExtension = EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS.includes(extension);
	const hasAllowedMimeType =
		!file.type || EMPLOYEE_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type);

	if (!hasAllowedExtension || !hasAllowedMimeType) {
		return `File must be ${EMPLOYEE_DOCUMENT_UPLOAD_COPY}.`;
	}

	return null;
};

export const validateRecruitmentResumeFile = (file: File) => {
	if (file.size > RECRUITMENT_RESUME_MAX_SIZE_MB * 1024 * 1024) {
		return `File must be ${RECRUITMENT_RESUME_UPLOAD_COPY}.`;
	}

	const extension = normalizeExtension(file.name.split(".").pop());
	const hasAllowedExtension = RECRUITMENT_RESUME_ALLOWED_EXTENSIONS.includes(extension);
	const hasAllowedMimeType =
		!file.type || RECRUITMENT_RESUME_ALLOWED_MIME_TYPES.includes(file.type);

	if (!hasAllowedExtension || !hasAllowedMimeType) {
		return `File must be ${RECRUITMENT_RESUME_UPLOAD_COPY}.`;
	}

	return null;
};
