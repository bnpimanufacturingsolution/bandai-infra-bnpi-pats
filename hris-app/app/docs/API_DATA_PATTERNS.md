# API Data Patterns & Service Rules

## Overview

This document defines the standard patterns for API services, hooks, and data handling in the HRIS application to ensure consistency and avoid nested dot notation issues.

## Base API Configuration

- **Base API URL**: `VITE_API_BASE_URL`
- **DEV deploy API**: `https://hris-api-dev-161377059311.asia-southeast1.run.app`
- **UAT deploy API**: `https://hris-api-uat-161377059311.asia-southeast1.run.app`
- **API Client**: Already handles `.data` extraction automatically
- **Response Structure**: All API responses follow the standard format

## Service Layer Rules

### 1. Service Method Pattern

```typescript
async getResource(params?: QueryParams): Promise<ResourceType> {
  try {
    setHrisAuthToken();

    const response = await hrisApiClient.get<ResourceType>(endpoint);
    if (!response.data) {
      throw new Error("Resource not found");
    }
    return response.data; // ✅ ALWAYS return response.data directly
  } catch (error: any) {
    console.error("Error fetching resource:", error);
    throw new Error(error.data?.errors?.[0]?.message || error.message || "Error message");
  }
}
```

### 2. Response Type Interfaces

```typescript
// ✅ CORRECT: Match the actual API response structure
export interface ResourceResponse {
	status: string;
	message: string;
	data: {
		resources: ResourceType[];
		pagination: {
			page: number;
			limit: number;
			total: number;
			totalPages: number;
		};
	};
	code: number;
	timestamp: string;
}

// ❌ WRONG: Don't create nested structures that don't exist
export interface ResourceResponse {
	data: ResourceType[] | { resources: ResourceType[] }; // This is confusing
}
```

### 3. Service Return Types

- **Single Resource**: Return the resource object directly
- **List Resources**: Return the data object with resources array and pagination
- **Never**: Return the full API response with status, message, etc.

## Hook Layer Rules

### 1. Hook Type Definitions

```typescript
// ✅ CORRECT: Use the actual data structure returned by service
export const useResource = (id: string) => {
	return useQuery<ResourceType | null>({
		queryKey: queryKeys.resource.detail(id),
		queryFn: () => resourceService.getResource(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};

// ✅ CORRECT: For list endpoints
export const useResources = (params?: QueryParams) => {
	return useQuery<{
		resources: ResourceType[];
		pagination: PaginationInfo;
	}>({
		queryKey: queryKeys.resource.list(params),
		queryFn: () => resourceService.getResources(params),
		staleTime: 2 * 60 * 1000,
	});
};
```

### 2. Hook Return Types

- **Single Resource Hooks**: Return `ResourceType | null`
- **List Resource Hooks**: Return the data object structure
- **Never**: Return full API response structure in hooks

## Component Layer Rules

### 1. Data Access Patterns

```typescript
// ✅ CORRECT: Access data directly from hook
const { data: resourceData } = useResource(id);
if (!resourceData) return null;

// ✅ CORRECT: For list data
const { data: resourcesData } = useResources();
if (!resourcesData?.resources) return [];

const resources = resourcesData.resources;

// ❌ WRONG: Don't use nested dot notation
const resources = resourcesData.data.resources; // This is wrong!
```

### 2. Data Processing Functions

```typescript
// ✅ CORRECT: Simple data access
const processData = () => {
	if (!data?.items) return [];
	return data.items.map((item) => ({ ...item }));
};

// ❌ WRONG: Complex nested access
const processData = () => {
	if (!data?.data?.items) return [];
	return data.data.items.map((item) => ({ ...item }));
};
```

## Common API Response Structures

### 1. Single Resource Response

```json
{
	"status": "success",
	"message": "Resource retrieved successfully",
	"data": {
		"resource": {
			/* resource object */
		}
	},
	"code": 200,
	"timestamp": "2025-01-01T00:00:00.000Z"
}
```

**Service Returns**: `response.data.resource` (the resource object directly)

### 2. List Resource Response

```json
{
	"status": "success",
	"message": "Resources retrieved successfully",
	"data": {
		"resources": [
			/* array of resources */
		],
		"pagination": {
			/* pagination info */
		}
	},
	"code": 200,
	"timestamp": "2025-01-01T00:00:00.000Z"
}
```

**Service Returns**: `response.data` (the data object with resources and pagination)

### 3. Today's Attendance Response

```json
{
	"status": "success",
	"message": "Today's attendance retrieved successfully",
	"data": {
		"attendance": {
			/* attendance object */
		},
		"status": "present",
		"hasTimeIn": true,
		"hasTimeOut": false
	},
	"code": 200,
	"timestamp": "2025-01-01T00:00:00.000Z"
}
```

**Service Returns**: `response.data.attendance` (the attendance object directly)

## Error Handling Rules

### 1. Service Level

```typescript
try {
	const response = await hrisApiClient.get<ResponseType>(endpoint);
	if (!response.data) {
		throw new Error("Resource not found");
	}
	return response.data;
} catch (error: any) {
	console.error("Error fetching resource:", error);
	throw new Error(error.data?.errors?.[0]?.message || error.message || "Error message");
}
```

### 2. Component Level

```typescript
const { data, isLoading, error } = useResource(id);

if (isLoading) return <Loading />;
if (error) return <Error message={error.message} />;
if (!data) return <Empty />;
```

## Testing Checklist

Before creating any new service or hook:

1. ✅ Check existing service patterns (department, employee)
2. ✅ Verify API response structure with actual API calls
3. ✅ Use simple data access patterns (no nested dots)
4. ✅ Return appropriate data types from services
5. ✅ Use correct TypeScript interfaces
6. ✅ Test with real API data
7. ✅ Document any special cases

## Common Mistakes to Avoid

1. ❌ **Nested Dot Notation**: `data.data.resources` instead of `data.resources`
2. ❌ **Wrong Return Types**: Returning full API response instead of data
3. ❌ **Inconsistent Patterns**: Different patterns for similar endpoints
4. ❌ **Complex Interfaces**: Over-complicating response type definitions
5. ❌ **Missing Error Handling**: Not handling API errors properly

## Examples

### ✅ Good Service Method

```typescript
async getEmployeeAttendance(employeeId: string): Promise<{
  attendances: AttendanceRecord[];
  pagination: PaginationInfo;
}> {
  try {
    setHrisAuthToken();
    const response = await hrisApiClient.get<{
      attendances: AttendanceRecord[];
      pagination: PaginationInfo;
    }>(`/api/employee/${employeeId}/attendance`);

    if (!response.data) {
      throw new Error("Attendance not found");
    }
    return response.data;
  } catch (error: any) {
    console.error("Error fetching attendance:", error);
    throw new Error(error.message || "Error fetching attendance");
  }
}
```

### ✅ Good Component Usage

```typescript
const { data: attendanceData } = useEmployeeAttendance(employeeId);
if (!attendanceData?.attendances) return [];

const attendances = attendanceData.attendances;
```

### ❌ Bad Component Usage

```typescript
const { data: attendanceData } = useEmployeeAttendance(employeeId);
const attendances = attendanceData.data.attendances; // WRONG!
```

---

**Remember**: Keep it simple, follow existing patterns, and always test with real API data!
