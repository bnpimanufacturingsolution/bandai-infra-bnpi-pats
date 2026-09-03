/**
 * Script to update user metadata with Hikvision employeeNo (empId) and enrollment status
 * Matches Hikvision users with database users by name (fuzzy matching)
 *
 * Usage:
 *   AUTH_TOKEN=your_token ts-node scripts/update-hikvision-metadata.ts
 *   or set AUTH_TOKEN in .env file
 */

import { PrismaClient } from "../generated/prisma";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

const AUTH_BASE_URL = "https://adam-auth-431713067666.asia-southeast1.run.app";
const AUTH_TOKEN =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTI1MGI4NzQ2NzBhNDI5ZjM0MjlhMzQiLCJyb2xlIjoiYWRtaW4iLCJyb2xlSWQiOiI2OTI1MGI4NDQ2NzBhNDI5ZjM0MjlhMmEiLCJvcmdhbml6YXRpb25JZCI6IjY5MjUwYjgzNDY3MGE0MjlmMzQyOWEyNyIsIm1ldGFkYXRhIjpudWxsLCJpYXQiOjE3NjU5MzE3ODksImV4cCI6MTc2NjAxODE4OX0.CyMtrQvQ9hOAM1apdUv33QFRXDbqHkNJBI9af6VR6q8";

// Hikvision user data from the API responses
const hikvisionUsers = [
	// From first response
	{ employeeNo: "1", name: "RICARDO HOLLERO", valid: true },
	{ employeeNo: "2", name: "Althea Olindo", valid: true },
	{ employeeNo: "4", name: "Justin Venedict ", valid: false },
	{ employeeNo: "5", name: "Lohn Maderazo", valid: true },
	{ employeeNo: "8", name: "sam abordo", valid: true },
	{ employeeNo: "9", name: "Romeo Rono", valid: true },
	{ employeeNo: "13", name: "Cyd Layug Calonzo", valid: true },
	{ employeeNo: "15", name: "Giff Fulla", valid: true },
	{ employeeNo: "16", name: "Archie Rono", valid: true },
	{ employeeNo: "17", name: "Jefferson Nicdao", valid: true },
	// From second response
	{ employeeNo: "19", name: "Arienne Constantino", valid: true },
	{ employeeNo: "20", name: "Lance Mendoza", valid: false },
	{ employeeNo: "21", name: "Ronver Cabacungan", valid: true },
	{ employeeNo: "22", name: "Bernadette Maximo", valid: true },
	{ employeeNo: "23", name: "Ericka Osilio", valid: true },
	{ employeeNo: "25", name: "Fatima Atara", valid: true },
	{ employeeNo: "27", name: "Michaella", valid: true },
	{ employeeNo: "31", name: "Michael", valid: true },
	{ employeeNo: "7", name: "renz", valid: true },
	{ employeeNo: "14", name: "ernest", valid: true },
	// From third response
	{ employeeNo: "18", name: "Zen", valid: true },
	{ employeeNo: "29", name: "bryan", valid: true },
	{ employeeNo: "32", name: "melvin", valid: true },
	{ employeeNo: "33", name: "ayan", valid: true },
	{ employeeNo: "3", name: "DALEN GUEVARA", valid: true },
	{ employeeNo: "12", name: "JR", valid: true },
	{ employeeNo: "24", name: "kenneth  Cruz", valid: true },
	{ employeeNo: "11", name: "JHON LERVIE", valid: true },
	{ employeeNo: "6", name: "arnaldo", valid: true },
	{ employeeNo: "10", name: "rey jhon capito", valid: true },
];

/**
 * Fetch all users from the API
 */
async function fetchAllUsers(): Promise<
	Array<{
		id: string;
		firstName: string;
		lastName: string;
		email: string;
	}>
> {
	const url = `${AUTH_BASE_URL}/api/user?limit=1000&filter=organizationId:69884da971e2dc9d6ac67b59,status:active&document=true`;
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (AUTH_TOKEN) {
		headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
	}

	const response = await fetch(url, { method: "GET", headers });
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to fetch users: ${response.status} ${text}`);
	}

	const json = await response.json();
	const users = json?.data?.users || json?.users || [];

	// Extract users with metadata.employee
	return users
		.filter((user: any) => user.metadata?.employee?.personalInfo)
		.map((user: any) => ({
			id: user.id,
			firstName: user.metadata.employee.personalInfo.firstName,
			lastName: user.metadata.employee.personalInfo.lastName,
			email: user.email,
		}));
}

// Database users from the API response (fallback if API fetch fails)
const databaseUsers = [
	{
		id: "69420044d41623091762d2e4",
		firstName: "ARCHIE",
		lastName: "ROÑO",
		email: "archie.rono@uzaro.local",
	},
	{
		id: "69420041d41623091762d2e1",
		firstName: "JOSHUA",
		lastName: "FLORES",
		email: "joshua.flores@uzaro.local",
	},
	{
		id: "6942003ed41623091762d2de",
		firstName: "REY JOHN",
		lastName: "CAPITO",
		email: "rey.capito@uzaro.local",
	},
	{
		id: "6942003bd41623091762d2db",
		firstName: "ERNEST DODZ",
		lastName: "MALASA",
		email: "ernest.malasa@uzaro.local",
	},
	{
		id: "69420038d41623091762d2d8",
		firstName: "ZEN ANDREI",
		lastName: "OBRERO",
		email: "zen.obrero@uzaro.local",
	},
	{
		id: "69420035d41623091762d2d5",
		firstName: "RENZ GERONE",
		lastName: "ROSADA",
		email: "renz.rosada@uzaro.local",
	},
	{
		id: "69420032d41623091762d2d2",
		firstName: "BRYAN GABRIEL",
		lastName: "RUBIO",
		email: "bryan.rubio@uzaro.local",
	},
	{
		id: "6942002ed41623091762d2cf",
		firstName: "JUBERT",
		lastName: "PIDO",
		email: "jubert.pido@uzaro.local",
	},
	{
		id: "6942002bd41623091762d2cc",
		firstName: "ARNALDO",
		lastName: "PANGANIBAN",
		email: "arnaldo.panganiban@uzaro.local",
	},
	{
		id: "69420028d41623091762d2c9",
		firstName: "ALTHEA KRISTAH",
		lastName: "OLINDO",
		email: "althea.olindo@uzaro.local",
	},
	{
		id: "69420025d41623091762d2c6",
		firstName: "MICHAELLA JEANEL",
		lastName: "VERA",
		email: "michaella.vera@uzaro.local",
	},
	{
		id: "69420022d41623091762d2c3",
		firstName: "MA. FATIMA",
		lastName: "ATARA",
		email: "fatima.atara@uzaro.local",
	},
	{
		id: "6942001ed41623091762d2c0",
		firstName: "LOUNALY",
		lastName: "CABACUNGA",
		email: "lounaly.cabacunga@uzaro.local",
	},
	{
		id: "6942001bd41623091762d2bd",
		firstName: "ROGELIO",
		lastName: "CASTRO",
		email: "rogelio.castro@uzaro.local",
	},
	{
		id: "69420017d41623091762d2ba",
		firstName: "PAOLO",
		lastName: "PULIDO",
		email: "paolo.pulido@uzaro.local",
	},
	{
		id: "69420013d41623091762d2b7",
		firstName: "KING ARAM",
		lastName: "ALESNA",
		email: "king.alesna@uzaro.local",
	},
	{
		id: "69420010d41623091762d2b4",
		firstName: "JOHN LERVIE",
		lastName: "TADENA",
		email: "john.tadena@uzaro.local",
	},
	{
		id: "6942000dd41623091762d2b1",
		firstName: "KENNETH",
		lastName: "CRUZ",
		email: "kenneth.cruz@uzaro.local",
	},
	{
		id: "6942000ad41623091762d2ae",
		firstName: "JOSEPH THOMAS",
		lastName: "FERNANDEZ",
		email: "joseph.fernandez@uzaro.local",
	},
	{
		id: "69420006d41623091762d2ab",
		firstName: "OMELLEDEE",
		lastName: "SALGADO",
		email: "omelledee.salgado@uzaro.local",
	},
	{
		id: "69420003d41623091762d2a8",
		firstName: "MARVIN",
		lastName: "ZAFRA",
		email: "marvin.zafra@uzaro.local",
	},
	{
		id: "69420000d41623091762d2a5",
		firstName: "GIFF",
		lastName: "FULLA",
		email: "giff.fulla@uzaro.local",
	},
	{
		id: "6941fffdd41623091762d2a2",
		firstName: "JUSTIN VENEDICT",
		lastName: "EQUIRON",
		email: "justin.equiron@uzaro.local",
	},
	{
		id: "6941fff9d41623091762d29f",
		firstName: "MICHAEL FRANCIS",
		lastName: "MISSION",
		email: "michael.mission@uzaro.local",
	},
	{
		id: "6941fff6d41623091762d29c",
		firstName: "DALEN",
		lastName: "GUEVARA",
		email: "dalen.guevara@uzaro.local",
	},
	{
		id: "6941fff4d41623091762d299",
		firstName: "LANCE PATRICK",
		lastName: "MENDOZA",
		email: "lance.mendoza@uzaro.local",
	},
	{
		id: "6941fff1d41623091762d296",
		firstName: "JEFFERSON",
		lastName: "NICDAO",
		email: "jefferson.nicdao@uzaro.local",
	},
	{
		id: "6941ffedd41623091762d293",
		firstName: "RICARDO",
		lastName: "HOLLERO",
		email: "ricardo.hollero@uzaro.local",
	},
	{
		id: "6941ffead41623091762d290",
		firstName: "BERNADETH",
		lastName: "MAXIMO",
		email: "bernadeth.maximo@uzaro.local",
	},
	{
		id: "6941ffe6d41623091762d28d",
		firstName: "ERICKA JOYCE",
		lastName: "OSILLO",
		email: "ericka.osillo@uzaro.local",
	},
	{
		id: "6941ffe3d41623091762d28a",
		firstName: "ARIENNE",
		lastName: "CONSTANTINO",
		email: "arienne.constantino@uzaro.local",
	},
	{
		id: "6941ffe0d41623091762d287",
		firstName: "ANGELIQUE",
		lastName: "LEONOR",
		email: "angelique.leonor@uzaro.local",
	},
	{
		id: "6941ffddd41623091762d284",
		firstName: "GAB",
		lastName: "BENEDICTO",
		email: "gab.benedicto@uzaro.local",
	},
	{
		id: "6941ffdad41623091762d281",
		firstName: "CYDTAHDEL",
		lastName: "LAYUG",
		email: "cydthadel.layug@uzaro.local",
	},
];

/**
 * Normalize a name for comparison (lowercase, remove extra spaces, handle special characters)
 */
function normalizeName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/\s+/g, " ")
		.replace(/[^\w\s]/g, "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, ""); // Remove diacritics
}

/**
 * Calculate similarity between two names (simple Jaccard similarity on words)
 */
function nameSimilarity(name1: string, name2: string): number {
	const normalized1 = normalizeName(name1);
	const normalized2 = normalizeName(name2);

	// Exact match
	if (normalized1 === normalized2) {
		return 1.0;
	}

	// Check if one contains the other
	if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
		return 0.9;
	}

	// Split into words
	const words1 = new Set(normalized1.split(/\s+/).filter((w) => w.length > 0));
	const words2 = new Set(normalized2.split(/\s+/).filter((w) => w.length > 0));

	// Calculate Jaccard similarity
	const intersection = new Set([...words1].filter((w) => words2.has(w)));
	const union = new Set([...words1, ...words2]);

	if (union.size === 0) return 0;

	return intersection.size / union.size;
}

/**
 * Match Hikvision user to database user
 */
function matchUser(
	hikvisionUser: { employeeNo: string; name: string; valid: boolean },
	dbUsers: Array<{ id: string; firstName: string; lastName: string; email: string }>,
): { userId: string; similarity: number } | null {
	const hikvisionFullName = hikvisionUser.name.trim();
	let bestMatch: { userId: string; similarity: number } | null = null;
	let bestSimilarity = 0;

	for (const dbUser of dbUsers) {
		const dbFullName = `${dbUser.firstName} ${dbUser.lastName}`.trim();

		// Try full name match
		let similarity = nameSimilarity(hikvisionFullName, dbFullName);

		// Try first name only (for cases like "renz", "ernest", "Zen", etc.)
		const hikvisionWords = hikvisionFullName.split(/\s+/);
		if (hikvisionWords.length === 1) {
			const firstNameSimilarity = nameSimilarity(hikvisionWords[0], dbUser.firstName);
			if (firstNameSimilarity > similarity) {
				similarity = firstNameSimilarity;
			}
		}

		// Try last name only
		if (hikvisionWords.length === 1) {
			const lastNameSimilarity = nameSimilarity(hikvisionWords[0], dbUser.lastName);
			if (lastNameSimilarity > similarity) {
				similarity = lastNameSimilarity;
			}
		}

		// Special case handling
		// "Cyd Layug Calonzo" matches "CYDTAHDEL LAYUG"
		if (
			normalizeName(hikvisionFullName).includes("cyd") &&
			normalizeName(hikvisionFullName).includes("layug") &&
			normalizeName(dbFullName).includes("cyd") &&
			normalizeName(dbFullName).includes("layug")
		) {
			similarity = 0.95;
		}

		// "Michaella" matches "MICHAELLA JEANEL VERA"
		if (
			normalizeName(hikvisionFullName) === "michaella" &&
			normalizeName(dbUser.firstName).includes("michaella")
		) {
			similarity = 0.9;
		}

		// "Michael" matches "MICHAEL FRANCIS MISSION"
		if (
			normalizeName(hikvisionFullName) === "michael" &&
			normalizeName(dbUser.firstName).includes("michael")
		) {
			similarity = 0.9;
		}

		// "JHON LERVIE" matches "JOHN LERVIE TADENA" (typo handling)
		if (
			normalizeName(hikvisionFullName).includes("jhon") &&
			normalizeName(hikvisionFullName).includes("lervie") &&
			normalizeName(dbFullName).includes("john") &&
			normalizeName(dbFullName).includes("lervie")
		) {
			similarity = 0.95;
		}

		if (similarity > bestSimilarity) {
			bestSimilarity = similarity;
			bestMatch = { userId: dbUser.id, similarity };
		}
	}

	// Only return match if similarity is above threshold
	return bestSimilarity >= 0.6 ? bestMatch : null;
}

/**
 * Fetch user metadata from API
 */
async function fetchUser(userId: string): Promise<any> {
	const url = `${AUTH_BASE_URL}/api/user/${userId}`;
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (AUTH_TOKEN) {
		headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
	}

	const response = await fetch(url, { method: "GET", headers });
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to fetch user ${userId}: ${response.status} ${text}`);
	}

	const json = await response.json();
	return json?.data || json?.user || json;
}

/**
 * Update employee deviceEmpId in the database
 */
async function updateEmployeeDeviceEmpId(userId: string, empId: string): Promise<void> {
	try {
		const employee = await prisma.employee.findFirst({
			where: { userId },
		});

		if (!employee) {
			console.warn(`Warning: No employee found for userId ${userId}`);
			return;
		}

		await prisma.employee.update({
			where: { id: employee.id },
			data: { deviceEmpId: empId },
		});

		console.log(`✓ Updated employee ${employee.id} with deviceEmpId: ${empId}`);
	} catch (error: any) {
		console.error(`Error updating employee deviceEmpId for userId ${userId}: ${error.message}`);
		throw error;
	}
}

/**
 * Update user metadata with device access information
 */
async function updateUserMetadata(
	userId: string,
	empId: string,
	status: "enrolled" | "unenrolled",
): Promise<void> {
	const url = `${AUTH_BASE_URL}/api/user/${userId}`;

	// Fetch existing user to preserve metadata
	let existingMetadata = {};
	try {
		const user = await fetchUser(userId);
		existingMetadata = user.metadata || {};
	} catch (error) {
		console.warn(
			`Warning: Could not fetch existing metadata for user ${userId}, continuing...`,
		);
	}

	const payload = {
		metadata: {
			...existingMetadata,
			device: {
				...((existingMetadata as any).device || {}),
				access: {
					empId: empId,
					status: status,
				},
			},
		},
	};

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (AUTH_TOKEN) {
		headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
	}

	const response = await fetch(url, {
		method: "PATCH",
		headers,
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Failed to update user metadata (${userId}): ${response.status} ${text}`);
	}

	const result = await response.json();
	console.log(`✓ Updated user ${userId} with empId: ${empId}, status: ${status}`);
	return result;
}

/**
 * Main function to update all user metadata
 */
async function main() {
	console.log("Starting Hikvision metadata update...");
	console.log(`Found ${hikvisionUsers.length} Hikvision users\n`);

	// Try to fetch users from API, fallback to hardcoded list
	let dbUsers = databaseUsers;
	try {
		console.log("Fetching users from API...");
		dbUsers = await fetchAllUsers();
		console.log(`Fetched ${dbUsers.length} users from API\n`);
	} catch (error: any) {
		console.warn(`Warning: Could not fetch users from API: ${error.message}`);
		console.log(`Using hardcoded list of ${databaseUsers.length} users\n`);
	}

	const matches: Array<{
		userId: string;
		empId: string;
		status: "enrolled" | "unenrolled";
		hikvisionName: string;
		dbName: string;
		similarity: number;
	}> = [];
	const unmatched: Array<{ hikvisionName: string; employeeNo: string }> = [];

	// Match Hikvision users to database users
	for (const hikvisionUser of hikvisionUsers) {
		const match = matchUser(hikvisionUser, dbUsers);
		if (match) {
			const dbUser = dbUsers.find((u) => u.id === match.userId);
			const status: "enrolled" | "unenrolled" = hikvisionUser.valid
				? "enrolled"
				: "unenrolled";
			matches.push({
				userId: match.userId,
				empId: hikvisionUser.employeeNo,
				status,
				hikvisionName: hikvisionUser.name,
				dbName: dbUser ? `${dbUser.firstName} ${dbUser.lastName}` : "Unknown",
				similarity: match.similarity,
			});
		} else {
			unmatched.push({
				hikvisionName: hikvisionUser.name,
				employeeNo: hikvisionUser.employeeNo,
			});
		}
	}

	console.log(`\nMatched ${matches.length} users:`);
	for (const match of matches) {
		console.log(
			`  ${match.hikvisionName} → ${match.dbName} (similarity: ${(match.similarity * 100).toFixed(0)}%)`,
		);
	}

	if (unmatched.length > 0) {
		console.log(`\nUnmatched ${unmatched.length} Hikvision users:`);
		for (const unmatchedUser of unmatched) {
			console.log(
				`  - ${unmatchedUser.hikvisionName} (employeeNo: ${unmatchedUser.employeeNo})`,
			);
		}
	}

	// Update metadata
	console.log(`\nUpdating user metadata and employee deviceEmpId...`);
	let successCount = 0;
	let errorCount = 0;

	for (const match of matches) {
		try {
			// Update user metadata
			await updateUserMetadata(match.userId, match.empId, match.status);

			// Update employee deviceEmpId
			await updateEmployeeDeviceEmpId(match.userId, match.empId);

			successCount++;
			// Add a small delay to avoid rate limiting
			await new Promise((resolve) => setTimeout(resolve, 100));
		} catch (error: any) {
			console.error(`✗ Error updating ${match.dbName}: ${error.message}`);
			errorCount++;
		}
	}

	console.log(`\n=== Summary ===`);
	console.log(`Successfully updated: ${successCount}`);
	console.log(`Errors: ${errorCount}`);
	console.log(`Unmatched: ${unmatched.length}`);
}

// Run the script
main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (error) => {
		console.error("Fatal error:", error);
		await prisma.$disconnect();
		process.exit(1);
	});
