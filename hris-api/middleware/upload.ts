import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { buildErrorResponse } from "../helper/error-handler";

// Configure multer for memory storage
const storage = multer.memoryStorage();
const normalizeFileExtension = (value?: string | null) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/^\./, "");

const getFileExtension = (file: Express.Multer.File) =>
	normalizeFileExtension(file.originalname.split(".").pop());

// File filter function
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
	// Check if file is an image
	if (file.mimetype.startsWith("image/")) {
		cb(null, true);
	} else {
		cb(new Error("Only image files are allowed!"));
	}
};

// Create multer instance
const upload = multer({
	storage: storage,
	fileFilter: fileFilter,
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB limit per file
		files: 10, // Maximum 10 files
	},
});

// Export different upload configurations
export const uploadSingle = upload.single("image");
export const uploadMultiple = upload.array("images", 10); // Maximum 10 images
export const uploadFields = upload.fields([
	{ name: "images", maxCount: 10 },
	{ name: "thumbnails", maxCount: 5 },
]);
export const uploadOrganizationFiles = upload.fields([
	{ name: "logo", maxCount: 1 },
	{ name: "background", maxCount: 1 },
]);

export const uploadUserFiles = upload.fields([{ name: "avatar", maxCount: 1 }]);

// New upload configuration for facility images (1-5 images)
export const uploadFacilityImages = upload.array("images", 5);

// Upload configuration for room type images (multiple images)
export const uploadRoomTypeImages = upload.array("images", 10); // Maximum 10 images for room types

export const uploadFacilityTypeImages = upload.array("images", 10); // Maximum 10 images for facility types

// Upload configuration for CSV files
export const uploadCSV = multer({
	storage: storage,
	fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
		// Check if file is a CSV
		if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
			cb(null, true);
		} else {
			cb(new Error("Only CSV files are allowed!"));
		}
	},
	limits: {
		fileSize: 50 * 1024 * 1024, // 50MB limit for CSV files
		files: 1, // Maximum 1 CSV file
	},
}).single("file");

const APPLICANT_RESUME_ALLOWED_MIME_TYPES = [
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/bmp",
] as const;

const APPLICANT_RESUME_ALLOWED_EXTENSIONS = [
	"pdf",
	"doc",
	"docx",
	"jpg",
	"jpeg",
	"png",
	"webp",
	"gif",
	"bmp",
] as const;

const APPLICANT_RESUME_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const APPLICANT_RESUME_UPLOAD_COPY = "PDF, DOC, DOCX, or image up to 10MB";
const APPLICANT_RESUME_INVALID_MESSAGE =
	"Resume must be a PDF, DOC, DOCX, or image file.";

const isAllowedApplicantResumeFile = (file: Express.Multer.File) => {
	const extension = getFileExtension(file);
	const hasAllowedExtension = APPLICANT_RESUME_ALLOWED_EXTENSIONS.includes(
		extension as (typeof APPLICANT_RESUME_ALLOWED_EXTENSIONS)[number],
	);
	const hasAllowedMimeType =
		!file.mimetype ||
		APPLICANT_RESUME_ALLOWED_MIME_TYPES.includes(
			file.mimetype as (typeof APPLICANT_RESUME_ALLOWED_MIME_TYPES)[number],
		);

	return hasAllowedExtension && hasAllowedMimeType;
};

const applicantResumeUpload = multer({
	storage: storage,
	fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
		if (isAllowedApplicantResumeFile(file)) {
			cb(null, true);
		} else {
			cb(new Error(APPLICANT_RESUME_INVALID_MESSAGE));
		}
	},
	limits: {
		fileSize: APPLICANT_RESUME_MAX_SIZE_BYTES,
		files: 1,
	},
});

export const uploadApplicantResume = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	applicantResumeUpload.single("resume")(req, res, (err: any) => {
		if (!err) {
			next();
			return;
		}

		if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
			res.status(400).json(
				buildErrorResponse(`Resume file must be ${APPLICANT_RESUME_UPLOAD_COPY}.`, 400, [
					{ field: "resume", message: `Resume file must be ${APPLICANT_RESUME_UPLOAD_COPY}.` },
				]),
			);
			return;
		}

		if (err instanceof multer.MulterError) {
			res.status(400).json(
				buildErrorResponse("Invalid resume upload request.", 400, [
					{ field: "resume", message: "Invalid resume upload request." },
				]),
			);
			return;
		}

		res.status(400).json(
			buildErrorResponse(err?.message || APPLICANT_RESUME_INVALID_MESSAGE, 400, [
				{ field: "resume", message: err?.message || APPLICANT_RESUME_INVALID_MESSAGE },
			]),
		);
	});
};

// Upload configuration for contract files (PDF, JPG, PNG, TXT)
export const uploadDocument = multer({
	storage: storage,
	fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
		// Check if file is PDF, JPG, PNG, or TXT
		const allowedMimeTypes = [
			"application/pdf",
			"image/jpeg",
			"image/jpg",
			"image/png",
			"text/plain",
		];
		if (allowedMimeTypes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(new Error("Only PDF, JPG, PNG, or TXT files are allowed for documents!"));
		}
	},
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB limit
		files: 1, // Maximum 1 document file
	},
}).single("file");

// Upload configuration for applicant contract files - accepts both `contract` and `file` fields
const contractUpload = multer({
	storage: storage,
	fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
		const allowedMimeTypes = [
			"application/pdf",
			"image/jpeg",
			"image/jpg",
			"image/png",
			"text/plain",
		];
		if (allowedMimeTypes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(new Error("Only PDF, JPG, PNG, or TXT files are allowed for contract uploads!"));
		}
	},
	limits: {
		fileSize: 10 * 1024 * 1024,
		files: 1,
	},
});

export const uploadApplicantContract = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	contractUpload.fields([
		{ name: "contract", maxCount: 1 },
		{ name: "file", maxCount: 1 },
	])(req, res, (err: any) => {
		if (err) {
			next(err);
			return;
		}
		const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
		const selectedFile = files?.contract?.[0] || files?.file?.[0];
		if (selectedFile) {
			(req as any).file = selectedFile;
		}
		next();
	});
};

// Upload configuration for XLSX files
export const uploadXLSX = multer({
	storage: storage,
	fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
		// Check if file is an XLSX
		if (
			file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
			file.originalname.endsWith(".xlsx") ||
			file.originalname.endsWith(".xls")
		) {
			cb(null, true);
		} else {
			cb(new Error("Only XLSX/XLS files are allowed!"));
		}
	},
	limits: {
		fileSize: 50 * 1024 * 1024, // 50MB limit for XLSX files
		files: 1, // Maximum 1 XLSX file
	},
}).single("file");

// Upload configuration for import files (CSV, XLSX, XLS)
export const uploadImportFile = multer({
	storage: storage,
	fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
		const allowedMimeTypes = [
			"text/csv",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.ms-excel",
		];
		const allowedExtensions = [".csv", ".xlsx", ".xls"];

		if (
			allowedMimeTypes.includes(file.mimetype) ||
			allowedExtensions.some((ext) => file.originalname.toLowerCase().endsWith(ext))
		) {
			cb(null, true);
		} else {
			cb(new Error("Only CSV, XLSX, and XLS files are allowed!"));
		}
	},
	limits: {
		fileSize: 50 * 1024 * 1024, // 50MB limit
		files: 1,
	},
}).single("file");

export const uploadImportFiles = multer({
	storage: storage,
	fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
		const allowedMimeTypes = [
			"text/csv",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.ms-excel",
		];
		const allowedExtensions = [".csv", ".xlsx", ".xls"];

		if (
			allowedMimeTypes.includes(file.mimetype) ||
			allowedExtensions.some((ext) => file.originalname.toLowerCase().endsWith(ext))
		) {
			cb(null, true);
		} else {
			cb(new Error("Only CSV, XLSX, and XLS files are allowed!"));
		}
	},
	limits: {
		fileSize: 50 * 1024 * 1024,
		files: 10,
	},
}).any();

// Upload configuration for employee compliance documents (PDF, JPG, PNG) plus optional avatar image
const employeeDocumentUpload = multer({
	storage: storage,
	fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
		const documentMimeTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
		const avatarMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

		if (file.fieldname === "avatar" && avatarMimeTypes.includes(file.mimetype)) {
			cb(null, true);
		} else if (file.fieldname === "documents" && documentMimeTypes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(
				new Error(
					file.fieldname === "avatar"
						? "Only JPG, PNG, and WEBP files are allowed for avatars!"
						: "Only PDF, JPG, and PNG files are allowed for compliance documents!",
				),
			);
		}
	},
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB limit per file
		files: 11, // Maximum 10 documents + 1 avatar
	},
});

export const uploadEmployeeDocuments = (req: Request, res: Response, next: NextFunction) => {
	employeeDocumentUpload.fields([
		{ name: "documents", maxCount: 10 },
		{ name: "avatar", maxCount: 1 },
	])(req, res, (err: any) => {
		if (err) {
			next(err);
			return;
		}

		const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
		(req as any).documentFiles = files?.documents || [];
		(req as any).avatarFile = files?.avatar?.[0] || null;
		next();
	});
};

// Flexible upload for submissions - accepts any field name
export const uploadSubmissionFiles = upload.any();

export default upload;
