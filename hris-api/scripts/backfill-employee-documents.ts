/**
 * One-time backfill for legacy embedded employee documents.
 *
 * Source: employees.documents (legacy embedded array)
 * Target: documents collection (Document model)
 *
 * Idempotent key: employeeId + type + number + issueDate
 *
 * Usage:
 * npx ts-node scripts/backfill-employee-documents.ts
 */

import { MongoClient, ObjectId } from "mongodb";
import * as dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || process.env.MONGODB_URI;

if (!DATABASE_URL) {
	console.error("DATABASE_URL or MONGODB_URI environment variable is required");
	process.exit(1);
}

function toDateOrDefault(value: unknown, fallback: Date): Date {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (typeof value === "string" || typeof value === "number") {
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) return parsed;
	}
	return fallback;
}

function normalizeString(value: unknown, fallback = ""): string {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : fallback;
	}
	if (value === null || value === undefined) return fallback;
	return String(value);
}

async function backfillEmployeeDocuments() {
	const client = new MongoClient(DATABASE_URL);

	try {
		console.log("Starting employee document backfill...");
		await client.connect();
		console.log("Connected to MongoDB");

		const dbName = DATABASE_URL.split("/").pop()?.split("?")[0] || "template";
		const db = client.db(dbName);
		const employeesCollection = db.collection("employees");
		const documentsCollection = db.collection("documents");

		const employees = await employeesCollection
			.find(
				{
					documents: { $exists: true, $type: "array", $ne: [] },
				},
				{
					projection: { _id: 1, employeeId: 1, documents: 1 },
				},
			)
			.toArray();

		console.log(`Found ${employees.length} employee(s) with legacy embedded documents`);

		let inserted = 0;
		let skippedExisting = 0;
		let skippedInvalid = 0;

		for (const employee of employees) {
			const employeeObjectId = employee._id as ObjectId;
			if (!employeeObjectId) continue;

			const legacyDocuments = Array.isArray((employee as any).documents)
				? ((employee as any).documents as any[])
				: [];

			const seenInEmployee = new Set<string>();

			for (const legacyDoc of legacyDocuments) {
				const type = normalizeString(legacyDoc?.type, "document");
				const number = normalizeString(legacyDoc?.number, "");
				const issueDate = toDateOrDefault(legacyDoc?.issueDate, new Date());
				const key = `${employeeObjectId.toHexString()}|${type}|${number}|${issueDate.toISOString()}`;

				if (seenInEmployee.has(key)) {
					skippedExisting++;
					continue;
				}
				seenInEmployee.add(key);

				const exists = await documentsCollection.findOne({
					employeeId: employeeObjectId,
					type,
					number,
					issueDate,
				});

				if (exists) {
					skippedExisting++;
					continue;
				}

				const expiryDateRaw = legacyDoc?.expiryDate;
				const expiryDate =
					expiryDateRaw === null || expiryDateRaw === undefined
						? null
						: toDateOrDefault(expiryDateRaw, issueDate);

				const name = normalizeString(legacyDoc?.name, type || "Document");
				const fileUrl = legacyDoc?.fileUrl ? normalizeString(legacyDoc.fileUrl) : null;
				const ext = legacyDoc?.ext ? normalizeString(legacyDoc.ext) : null;

				if (!type) {
					skippedInvalid++;
					continue;
				}

				await documentsCollection.insertOne({
					name,
					type,
					number,
					issueDate,
					expiryDate,
					fileUrl,
					ext,
					employeeId: employeeObjectId,
					isDeleted: false,
					createdAt: new Date(),
					updatedAt: new Date(),
				});

				inserted++;
			}
		}

		console.log("Backfill complete");
		console.log(`Inserted: ${inserted}`);
		console.log(`Skipped existing: ${skippedExisting}`);
		console.log(`Skipped invalid: ${skippedInvalid}`);
	} finally {
		await client.close();
	}
}

backfillEmployeeDocuments()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Backfill failed:", error);
		process.exit(1);
	});
