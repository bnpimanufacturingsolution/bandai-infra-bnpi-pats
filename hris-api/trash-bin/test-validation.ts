import { CreateRequestSchema } from "../zod/request.zod";

console.log("Testing CreateRequestSchema validation...\n");

// Test 1: LEAVE request without dates (should FAIL)
console.log("=== Test 1: LEAVE request without dates ===");
const invalidLeaveRequest = {
	requesterId: "507f1f77bcf86cd799439011",
	type: "LEAVE",
	description: "Need some time off",
	// Missing startDate, endDate, metadata
};

const result1 = CreateRequestSchema.safeParse(invalidLeaveRequest);
if (result1.success) {
	console.log("❌ FAILED: Should have rejected request without dates");
	console.log("Parsed data:", JSON.stringify(result1.data, null, 2));
	console.log("startDate:", result1.data.startDate, "type:", typeof result1.data.startDate);
	console.log("endDate:", result1.data.endDate, "type:", typeof result1.data.endDate);
	console.log("metadata:", result1.data.metadata, "type:", typeof result1.data.metadata);
} else {
	console.log("✅ PASSED: Rejected as expected");
	console.log(
		"Errors:",
		result1.error.errors.map((e) => ({ path: e.path, message: e.message })),
	);
}

// Test 2: LEAVE request with all required fields (should PASS)
console.log("\n=== Test 2: LEAVE request with all required fields ===");
const validLeaveRequest = {
	requesterId: "507f1f77bcf86cd799439011",
	type: "LEAVE",
	description: "Need some time off",
	startDate: new Date("2025-11-20"),
	endDate: new Date("2025-11-25"),
	metadata: {
		leaveType: "Vacation",
		totalDays: 5,
	},
};

const result2 = CreateRequestSchema.safeParse(validLeaveRequest);
if (result2.success) {
	console.log("✅ PASSED: Accepted valid leave request");
} else {
	console.log("❌ FAILED: Should have accepted valid request");
	console.log("Errors:", result2.error.errors);
}

// Test 3: LEAVE request with endDate before startDate (should FAIL)
console.log("\n=== Test 3: LEAVE request with invalid date range ===");
const invalidDateRange = {
	requesterId: "507f1f77bcf86cd799439011",
	type: "LEAVE",
	description: "Need some time off",
	startDate: new Date("2025-11-25"),
	endDate: new Date("2025-11-20"), // Before start date!
	metadata: {
		leaveType: "Vacation",
		totalDays: 5,
	},
};

const result3 = CreateRequestSchema.safeParse(invalidDateRange);
if (result3.success) {
	console.log("❌ FAILED: Should have rejected invalid date range");
} else {
	console.log("✅ PASSED: Rejected invalid date range");
	console.log(
		"Errors:",
		result3.error.errors.map((e) => ({ path: e.path, message: e.message })),
	);
}

// Test 4: OTHER type request without dates (should PASS)
console.log("\n=== Test 4: OTHER type request without dates ===");
const validOtherRequest = {
	requesterId: "507f1f77bcf86cd799439011",
	type: "OTHER",
	description: "Some other request",
	// No dates required for OTHER type
};

const result4 = CreateRequestSchema.safeParse(validOtherRequest);
if (result4.success) {
	console.log("✅ PASSED: Accepted OTHER type without dates");
} else {
	console.log("❌ FAILED: Should have accepted OTHER type without dates");
	console.log("Errors:", result4.error.errors);
}

console.log("\n=== All tests completed ===");
