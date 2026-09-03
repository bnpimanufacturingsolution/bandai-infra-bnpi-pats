export interface PersistedFileMeta {
	name: string;
	type: string;
	size: number;
	lastModified: number;
}

export type ImportStep = "upload" | "map" | "preview";

export interface ImportSnapshotEnvelope {
	version: number;
	entityKey: string;
	savedAt: number;
	ttlMs: number;
	fileMeta?: PersistedFileMeta;
	preparedUploadStep: ImportStep | null;
	importStep: ImportStep;
	previewHeaders: string[];
	previewData: string[][];
	columnMapping: Record<string, string>;
	defaultValues: Record<string, string>;
	autoCreateResources: boolean;
	applyDefaultLeaveBalances: boolean;
	createTimesheets: boolean;
}

const DB_NAME = "hris-import-persistence";
const DB_VERSION = 1;
const STORE_NAME = "importSnapshots";

let dbPromise: Promise<IDBDatabase> | null = null;

function openImportPersistenceDb(): Promise<IDBDatabase> {
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

export async function getImportSnapshot(
	entityKey: string,
): Promise<ImportSnapshotEnvelope | null> {
	const db = await openImportPersistenceDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const store = tx.objectStore(STORE_NAME);
		const request = store.get(entityKey);
		request.onsuccess = () =>
			resolve((request.result as ImportSnapshotEnvelope | undefined) || null);
		request.onerror = () => reject(request.error || new Error("Failed to read snapshot"));
	});
}

export async function setImportSnapshot(snapshot: ImportSnapshotEnvelope): Promise<void> {
	const db = await openImportPersistenceDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		store.put(snapshot);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error || new Error("Failed to save snapshot"));
	});
}

export async function deleteImportSnapshot(entityKey: string): Promise<void> {
	const db = await openImportPersistenceDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		store.delete(entityKey);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error || new Error("Failed to delete snapshot"));
	});
}

export async function cleanupExpiredSnapshots(now: number = Date.now()): Promise<void> {
	const db = await openImportPersistenceDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		const cursorRequest = store.openCursor();

		cursorRequest.onsuccess = () => {
			const cursor = cursorRequest.result;
			if (!cursor) return;
			const snapshot = cursor.value as ImportSnapshotEnvelope;
			const ttlMs = Number(snapshot?.ttlMs || 0);
			const savedAt = Number(snapshot?.savedAt || 0);
			const isExpired = !savedAt || !ttlMs || now - savedAt > ttlMs;
			if (isExpired) {
				cursor.delete();
			}
			cursor.continue();
		};

		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error || new Error("Failed to cleanup snapshots"));
	});
}
