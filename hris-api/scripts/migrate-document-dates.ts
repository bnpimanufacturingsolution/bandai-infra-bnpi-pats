/**
 * Migration script to fix DateTime fields in documents collection.
 * Converts string dates to proper Date values in MongoDB/Prisma.
 *
 * Usage:
 * npx ts-node scripts/migrate-document-dates.ts
 * or npm run migrate:documents
 */

import { MongoClient } from "mongodb";
import { PrismaClient } from "../generated/prisma";
import * as dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || process.env.MONGODB_URI;

if (!DATABASE_URL) {
	console.error("DATABASE_URL or MONGODB_URI environment variable is required");
	process.exit(1);
}

const DB_URL: string = DATABASE_URL;
const prisma = new PrismaClient();

function isStringDate(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function convertToDate(value: unknown): Date | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (isStringDate(value) || typeof value === "number") {
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) return parsed;
	}
	return null;
}

async function migrateDocumentDates() {
	const client = new MongoClient(DB_URL);

	try {
		console.log("Starting document date migration...");
		await client.connect();
		console.log("Connected to database");

		const dbName = DB_URL.split("/").pop()?.split("?")[0] || "template";
		const db = client.db(dbName);
		const collection = db.collection("documents");

		const documents = await collection
			.find({
				$or: [{ issueDate: { $type: "string" } }, { expiryDate: { $type: "string" } }],
			})
			.toArray();

		if (!documents.length) {
			console.log("No document rows require date migration");
			return;
		}

		console.log(`Found ${documents.length} document row(s) to fix`);

		let fixedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;

		for (const doc of documents) {
			const docId = doc?._id?.toString?.();
			if (!docId) {
				skippedCount++;
				continue;
			}

			try {
				const issueDate = convertToDate((doc as any).issueDate) || new Date();
				const expiryDateRaw = (doc as any).expiryDate;
				const expiryDate =
					expiryDateRaw === undefined || expiryDateRaw === null
						? null
						: convertToDate(expiryDateRaw);

				try {
					await prisma.document.update({
						where: { id: docId },
						data: {
							issueDate,
							expiryDate,
						},
					});
				} catch (prismaError) {
					await collection.updateOne(
						{ _id: (doc as any)._id },
						{
							$set: {
								issueDate,
								expiryDate,
							},
						},
					);
				}

				fixedCount++;
			} catch (error: any) {
				errorCount++;
				console.error(`Failed to migrate document ${docId}: ${error?.message}`);
			}
		}

		console.log("Migration Summary:");
		console.log(`  Fixed: ${fixedCount}`);
		console.log(`  Skipped: ${skippedCount}`);
		console.log(`  Errors: ${errorCount}`);
		console.log("Document date migration completed");
	} finally {
		await client.close();
		await prisma.$disconnect();
	}
}

migrateDocumentDates()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Migration failed:", error);
		process.exit(1);
	});
