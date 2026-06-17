import type { FormData } from "~/types/employee-form.types";

export interface EmployeeFormDraftSnapshot {
	version: number;
	entityKey: string;
	organizationId: string;
	userId: string;
	savedAt: number;
	ttlMs: number;
	currentStep: number;
	enabledDocuments: Record<string, boolean>;
	formData: FormData;
}

interface EmployeeFormDraftIdentity {
	entityKey: string;
	organizationId: string;
	userId: string;
}

interface BuildEmployeeFormDraftSnapshotInput extends EmployeeFormDraftIdentity {
	currentStep: number;
	enabledDocuments: Record<string, boolean>;
	formData: FormData;
	savedAt?: number;
	ttlMs?: number;
}

const DB_NAME = "hris-employee-form-drafts";
const DB_VERSION = 1;
const STORE_NAME = "employeeFormDrafts";

export const EMPLOYEE_FORM_DRAFT_VERSION = 1;
export const EMPLOYEE_FORM_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBDatabase> | null = null;

const isFileInstance = (value: unknown) =>
	typeof File !== "undefined" && value instanceof File;

const isBlobInstance = (value: unknown) =>
	typeof Blob !== "undefined" && value instanceof Blob;

const sanitizeDraftValue = (value: unknown): unknown => {
	if (value === null || value === undefined) {
		return value ?? null;
	}

	if (isFileInstance(value) || isBlobInstance(value)) {
		return undefined;
	}

	if (Array.isArray(value)) {
		return value
			.map((item) => sanitizeDraftValue(item))
			.filter((item) => item !== undefined);
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "object") {
		const next: Record<string, unknown> = {};
		for (const [key, nestedValue] of Object.entries(value)) {
			const sanitizedNestedValue = sanitizeDraftValue(nestedValue);
			if (sanitizedNestedValue !== undefined) {
				next[key] = sanitizedNestedValue;
			}
		}
		return next;
	}

	return value;
};

const sanitizeEnabledDocuments = (enabledDocuments: Record<string, boolean>) =>
	Object.entries(enabledDocuments || {}).reduce(
		(acc, [key, value]) => {
			acc[key] = Boolean(value);
			return acc;
		},
		{} as Record<string, boolean>,
	);

const normalizeDraftDataForMeaningfulness = (formData: FormData): FormData => ({
	...formData,
	user: {
		...formData.user,
		password: "",
	},
	employee: {
		...formData.employee,
		employeeId: "",
	},
});

export const buildEmployeeFormDraftEntityKey = ({
	pathname,
	organizationId,
	userId,
}: {
	pathname: string;
	organizationId: string;
	userId: string;
}) => `${pathname}::${organizationId}::${userId}`;

export const sanitizeEmployeeFormDraftData = (formData: FormData): FormData => {
	const sanitized = sanitizeDraftValue(formData) as FormData;
	return {
		...sanitized,
		user: {
			...sanitized.user,
			password: "",
		},
	};
};

export const buildEmployeeFormDraftSnapshot = ({
	entityKey,
	organizationId,
	userId,
	currentStep,
	enabledDocuments,
	formData,
	savedAt = Date.now(),
	ttlMs = EMPLOYEE_FORM_DRAFT_TTL_MS,
}: BuildEmployeeFormDraftSnapshotInput): EmployeeFormDraftSnapshot => ({
	version: EMPLOYEE_FORM_DRAFT_VERSION,
	entityKey,
	organizationId,
	userId,
	savedAt,
	ttlMs,
	currentStep: Number.isInteger(currentStep) ? currentStep : 0,
	enabledDocuments: sanitizeEnabledDocuments(enabledDocuments),
	formData: sanitizeEmployeeFormDraftData(formData),
});

export const hasMeaningfulEmployeeFormDraftData = ({
	formData,
	defaultValues,
	enabledDocuments,
	currentStep,
}: {
	formData: FormData;
	defaultValues: FormData;
	enabledDocuments: Record<string, boolean>;
	currentStep: number;
}) => {
	const normalizedCurrent = normalizeDraftDataForMeaningfulness(
		sanitizeEmployeeFormDraftData(formData),
	);
	const normalizedDefaults = normalizeDraftDataForMeaningfulness(
		sanitizeEmployeeFormDraftData(defaultValues),
	);
	const hasEnabledDocuments = Object.values(sanitizeEnabledDocuments(enabledDocuments)).some(Boolean);

	return (
		hasEnabledDocuments ||
		Number(currentStep || 0) > 0 ||
		JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizedDefaults)
	);
};

export const validateEmployeeFormDraftSnapshot = (
	snapshot: unknown,
	{ entityKey, organizationId, userId }: EmployeeFormDraftIdentity,
	now: number = Date.now(),
): EmployeeFormDraftSnapshot | null => {
	if (!snapshot || typeof snapshot !== "object") {
		return null;
	}

	const candidate = snapshot as EmployeeFormDraftSnapshot;
	const isExpired =
		typeof candidate.savedAt !== "number" ||
		typeof candidate.ttlMs !== "number" ||
		candidate.ttlMs <= 0 ||
		now - candidate.savedAt > candidate.ttlMs;

	if (
		candidate.version !== EMPLOYEE_FORM_DRAFT_VERSION ||
		candidate.entityKey !== entityKey ||
		candidate.organizationId !== organizationId ||
		candidate.userId !== userId ||
		isExpired ||
		typeof candidate.currentStep !== "number" ||
		!candidate.formData ||
		typeof candidate.formData !== "object"
	) {
		return null;
	}

	return {
		...candidate,
		currentStep: Math.max(0, Math.trunc(candidate.currentStep || 0)),
		enabledDocuments: sanitizeEnabledDocuments(candidate.enabledDocuments || {}),
		formData: sanitizeEmployeeFormDraftData(candidate.formData),
	};
};

function openEmployeeFormDraftDb(): Promise<IDBDatabase> {
	if (typeof window === "undefined" || !window.indexedDB) {
		return Promise.reject(new Error("IndexedDB is not available"));
	}

	if (dbPromise) return dbPromise;

	dbPromise = new Promise((resolve, reject) => {
		const request = window.indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: "entityKey" });
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
	});

	return dbPromise;
}

export async function getEmployeeFormDraftSnapshot(
	entityKey: string,
): Promise<EmployeeFormDraftSnapshot | null> {
	const db = await openEmployeeFormDraftDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const store = tx.objectStore(STORE_NAME);
		const request = store.get(entityKey);
		request.onsuccess = () =>
			resolve((request.result as EmployeeFormDraftSnapshot | undefined) || null);
		request.onerror = () => reject(request.error || new Error("Failed to read employee draft"));
	});
}

export async function setEmployeeFormDraftSnapshot(
	snapshot: EmployeeFormDraftSnapshot,
): Promise<void> {
	const db = await openEmployeeFormDraftDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		store.put(snapshot);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error || new Error("Failed to save employee draft"));
	});
}

export async function deleteEmployeeFormDraftSnapshot(entityKey: string): Promise<void> {
	const db = await openEmployeeFormDraftDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		store.delete(entityKey);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error || new Error("Failed to delete employee draft"));
	});
}

export async function cleanupExpiredEmployeeFormDraftSnapshots(
	now: number = Date.now(),
): Promise<void> {
	const db = await openEmployeeFormDraftDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		const cursorRequest = store.openCursor();

		cursorRequest.onsuccess = () => {
			const cursor = cursorRequest.result;
			if (!cursor) return;
			const snapshot = cursor.value as EmployeeFormDraftSnapshot;
			const isExpired =
				typeof snapshot?.savedAt !== "number" ||
				typeof snapshot?.ttlMs !== "number" ||
				snapshot.ttlMs <= 0 ||
				now - snapshot.savedAt > snapshot.ttlMs;
			if (isExpired) {
				cursor.delete();
			}
			cursor.continue();
		};

		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error || new Error("Failed to cleanup employee drafts"));
	});
}
