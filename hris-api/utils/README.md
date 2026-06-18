# Query Utilities

This module provides reusable utilities for implementing consistent `getAll` functions across different controllers in the application.

## Overview

The query utilities handle:

- Query parameter validation (page, limit, sort, fields, order, filter)
- **Response format control (documents, pagination, count)**
- Filter parsing and building complex where conditions
- Field selection building for Prisma queries
- Pagination helpers
- Standardized response formatting

## Response Format Parameters

### New Query Parameters

| Parameter                 | Type    | Default | Description                                  |
| ------------------------- | ------- | ------- | -------------------------------------------- |
| `documents` or `document` | boolean | false   | Return full data without pagination metadata |
| `pagination`              | boolean | false   | Return explicit paginated response format    |
| `count`                   | boolean | false   | Return total count of records                |

### Response Format Combinations

1. **Default Behavior** (no format parameters):

    ```
    GET /api/facility
    ```

    Returns informational message only - **no data returned**:

    ```json
    {
    	"status": "success",
    	"message": "facilities endpoint accessed successfully. Use parameters: ?documents=true (or ?document=true), ?pagination=true, or ?count=true to retrieve data.",
    	"data": {
    		"message": "No data returned. Please specify query parameters to retrieve data.",
    		"availableParameters": {
    			"documents": "Get simplified document format (or use 'document')",
    			"pagination": "Get paginated results",
    			"count": "Get total count only"
    		}
    	}
    }
    ```

2. **Documents Only**:

    ```
    GET /api/facility?documents=true
    # OR
    GET /api/facility?document=true
    ```

    Returns full detailed data without pagination metadata:

    ```json
    {
    	"status": "success",
    	"message": "facilities documents retrieved successfully",
    	"data": {
    		"facilities": [
    			{
    				"id": "123",
    				"name": "Room 101",
    				"facilityTypeId": "456",
    				"description": "Comfortable room with amenities",
    				"operatingHours": null,
    				"organizationId": "789",
    				"metadata": {
    					"roomNumber": "101"
    				},
    				"facilityType": {
    					"id": "456",
    					"name": "SUITE_ROOM",
    					"price": 500,
    					"metadata": {
    						"amenities": ["WIFI", "TV"],
    						"maxOccupancy": 2
    					}
    				},
    				"organization": {
    					"id": "789",
    					"name": "Hotel ABC"
    				},
    				"location": null,
    				"reservations": []
    			}
    		],
    		"totalCount": 41
    	}
    }
    ```

3. **Count Only**:

    ```
    GET /api/facility?count=true
    ```

    Returns count only (optimized - no data fetching):

    ```json
    {
    	"status": "success",
    	"message": "facilities count retrieved successfully",
    	"data": {
    		"count": 41
    	}
    }
    ```

4. **Both Documents and Count**:

    ```
    GET /api/facility?documents=true&count=true
    # OR
    GET /api/facility?document=true&count=true
    ```

    Returns both full detailed data and count:

    ```json
    {
    	"status": "success",
    	"message": "facilities documents and count retrieved successfully",
    	"data": {
    		"facilities": [
    			{
    				"id": "123",
    				"name": "Room 101",
    				"facilityTypeId": "456",
    				"description": "Comfortable room with amenities",
    				"operatingHours": null,
    				"organizationId": "789",
    				"metadata": {
    					"roomNumber": "101"
    				},
    				"facilityType": {
    					"id": "456",
    					"name": "SUITE_ROOM",
    					"price": 500,
    					"metadata": {
    						"amenities": ["WIFI", "TV"],
    						"maxOccupancy": 2
    					}
    				},
    				"organization": {
    					"id": "789",
    					"name": "Hotel ABC"
    				},
    				"location": null,
    				"reservations": []
    			}
    		],
    		"count": 41
    	}
    }
    ```

5. **All Three Parameters (Documents, Count, and Pagination)**:

    ```
    GET /api/facility?documents=true&count=true&pagination=true
    # OR
    GET /api/facility?document=true&count=true&pagination=true
    ```

    Returns full detailed data with both count and pagination metadata:

    ```json
    {
    	"status": "success",
    	"message": "facilities documents, count, and pagination retrieved successfully",
    	"data": {
    		"facilities": [
    			{
    				"id": "123",
    				"name": "Room 101",
    				"facilityTypeId": "456",
    				"description": "Comfortable room with amenities",
    				"operatingHours": null,
    				"organizationId": "789",
    				"metadata": {
    					"roomNumber": "101"
    				},
    				"facilityType": {
    					"id": "456",
    					"name": "SUITE_ROOM",
    					"price": 500,
    					"metadata": {
    						"amenities": ["WIFI", "TV"],
    						"maxOccupancy": 2
    					}
    				},
    				"organization": {
    					"id": "789",
    					"name": "Hotel ABC"
    				},
    				"location": null,
    				"reservations": []
    			}
    		],
    		"count": 41,
    		"pagination": {
    			"total": 41,
    			"page": 1,
    			"limit": 10,
    			"totalPages": 5,
    			"hasNext": true,
    			"hasPrev": false
    		}
    	}
    }
    ```

6. **Count and Pagination (without documents)**:

    ```
    GET /api/facility?count=true&pagination=true
    ```

    Returns pagination metadata and count, but no actual data (optimized):

    ```json
    {
    	"status": "success",
    	"message": "facilities pagination and count retrieved successfully",
    	"data": {
    		"count": 41,
    		"pagination": {
    			"total": 41,
    			"page": 1,
    			"limit": 10,
    			"totalPages": 5,
    			"hasNext": true,
    			"hasPrev": false
    		}
    	}
    }
    ```

7. **Pagination Only**:

    ```
    GET /api/facility?pagination=true
    ```

    Returns standard paginated format with full data:

    ```json
    {
    	"status": "success",
    	"message": "facilities retrieved successfully",
    	"data": {
    		"facilities": [
    			{
    				"id": "123",
    				"name": "Room 101",
    				"facilityTypeId": "456",
    				"description": "Comfortable room with amenities",
    				"operatingHours": null,
    				"organizationId": "789",
    				"metadata": {
    					"roomNumber": "101"
    				},
    				"facilityType": {
    					"id": "456",
    					"name": "SUITE_ROOM",
    					"price": 500,
    					"metadata": {
    						"amenities": ["WIFI", "TV"],
    						"maxOccupancy": 2
    					}
    				},
    				"organization": {
    					"id": "789",
    					"name": "Hotel ABC"
    				},
    				"location": null,
    				"reservations": []
    			}
    		],
    		"pagination": {
    			"total": 41,
    			"page": 1,
    			"limit": 10,
    			"totalPages": 5,
    			"hasNext": true,
    			"hasPrev": false
    		}
    	}
    }
    ```

8. **No Parameters**:

## Basic Usage

```typescript
import {
	handleQueryValidation,
	buildFieldSelection,
	buildOrderBy,
	createFormattedResponse,
	ResponseFormatOptions,
} from "../../utils/queryUtils";

const getAll = async (req: Request, res: Response, _next: NextFunction) => {
	// 1. Validate and parse query parameters
	const parsedParams = handleQueryValidation(req, res, logger);
	if (!parsedParams) return; // Response already sent if validation failed

	const { page, limit, skip, sort, fields, query, filter, order, documents, pagination, count } =
		parsedParams;

	try {
		// 2. Define base conditions
		const baseConditions = {
			isDeleted: false, // or any other base filtering
		};

		// 3. Build where clause
		let whereClause = { ...baseConditions };

		// Add search functionality if needed
		if (query) {
			whereClause.OR = [
				{ name: { contains: String(query) } },
				{ description: { contains: String(query) } },
				// Add more searchable fields as needed
			];
		}

		// Add advanced filtering if needed
		if (filter && filter.length > 0) {
			const filterConditions = buildFilterConditions(filter);
			if (filterConditions.length > 0) {
				if (whereClause.AND) {
					const existingAnd = Array.isArray(whereClause.AND)
						? whereClause.AND
						: [whereClause.AND];
					whereClause.AND = [...existingAnd, { OR: filterConditions }];
				} else {
					whereClause.AND = [{ OR: filterConditions }];
				}
			}
		}

		// 4. Optimize query execution based on format
		let data: any[] = [];
		let total: number = 0;

		if (!documents && !pagination && !count) {
			// No parameters provided → skip data fetching entirely
			// Will return informational message only
		} else if (count && !documents && !pagination) {
			// Only count requested, skip data fetching for performance
			total = await prisma.model.count({ where: whereClause });
		} else {
			// Fetch data for documents, pagination, or combination requests
			const findManyQuery = {
				where: whereClause,
				skip,
				take: limit,
				orderBy: buildOrderBy(sort, order),
			};

			// 5. Handle field selection
			if (fields) {
				findManyQuery.select = buildFieldSelection(fields);
			} else {
				findManyQuery.include = {
					// Define default includes
				};
			}

			// 6. Execute queries
			[data, total] = await Promise.all([
				prisma.model.findMany(findManyQuery),
				prisma.model.count({ where: whereClause }),
			]);
		}

		// 7. Return formatted response
		const formatOptions: ResponseFormatOptions = { documents, pagination, count };
		const response = createFormattedResponse(
			data,
			total,
			page,
			limit,
			formatOptions,
			"entityType", // e.g., "facilities"
			"dataKey", // e.g., "facilities"
		);

		res.status(200).json(response);
	} catch (error) {
		logger.error(`Error: ${error}`);
		res.status(500).json({ error: "Internal server error" });
	}
};
```

## executeFormattedQuery - Reusable Utility

The `executeFormattedQuery` function is a high-level utility that encapsulates all the flexible response format logic, making it easy to implement `documents`, `pagination`, and `count` parameters in any controller's `getAll` method.

### Usage

````typescript
import { executeFormattedQuery, handleQueryValidation } from "../../utils/queryUtils";

const getAll = async (req: Request, res: Response, _next: NextFunction) => {
	// 1. Validate and parse query parameters
	const parsedParams = handleQueryValidation(req, res, logger);
	if (!parsedParams) return; // Response already sent if validation failed

	// 2. Extract format parameters (automatically included in parsedParams)
	const { documents, pagination, count } = parsedParams;

	try {
		// 3. Build base conditions and where clause
		const baseConditions = {
			organizationId: req.organizationId, // if needed
			isDeleted: false, // for soft delete
		};

		const searchFields = getSearchFields("modelName", ["relation1", "relation2"]);
		const whereClause = buildAdvancedWhereClause(
			baseConditions,
			"modelName",
			parsedParams.query,
			searchFields,
			parsedParams.filter,
		);

		// 4. Define include options
		const includeOptions = {
			relation1: true,
			relation2: {
				select: { id: true, name: true },
				where: { isDeleted: false },
			},
		};

		// 5. Use the utility function - handles all conditional logic automatically
		const response = await executeFormattedQuery(
			prisma,
			"modelName",        // Prisma model name (e.g., "facility", "user")
			whereClause,        // Where conditions
			parsedParams,       // All parsed parameters
			"entityType",       // For response messages (e.g., "facilities")
			"dataKey",          // JSON key for data array (e.g., "facilities")
			includeOptions      // Optional: Include/relation options
		);

		res.status(200).json(response);
	} catch (error) {
		// Error handling
		res.status(500).json({ error: "Internal server error" });
	}
};

### Benefits

1. **Automatic Format Handling**: The utility automatically handles all parameter combinations:
   - `?documents=true` → Full data without pagination metadata
   - `?pagination=true` → Full data with pagination metadata
   - `?count=true` → Count only (optimized, no data fetching)
   - `?count=true&documents=true` → Full data + count
   - `?count=true&pagination=true` → Pagination metadata + count (no data)
   - `?count=true&documents=true&pagination=true` → Full data + count + pagination metadata
   - No parameters → Informational message (no data)

2. **Performance Optimization**: Automatically skips data fetching when only count is needed

3. **Consistent Responses**: Ensures all controllers return the same response structure

4. **Reduced Code Duplication**: Eliminates the need to implement conditional logic in every controller

5. **Easy Migration**: Existing controllers can be updated by replacing manual query logic with this single function call

### Implementation Examples

- ✅ **Facility Controller**: Updated to use `executeFormattedQuery`
- ✅ **Location Controller**: Updated to use `executeFormattedQuery`
- ✅ **Organization Controller**: Updated to use `executeFormattedQuery`
- ✅ **User Controller**: Updated to use `executeFormattedQuery`

### Next Steps

Apply the same pattern to remaining controllers:
- Reservation Controller
- FacilityType Controller
- RateType Controller
- Role Controller
- And others...

Each controller just needs to:
1. Import the utility
2. Replace manual query logic with `executeFormattedQuery`
3. Define appropriate `includeOptions` for their relations

## API Reference

### `handleQueryValidation(req, res, logger?)`

Validates all query parameters and returns parsed results. If validation fails, it automatically sends an error response.

**Returns:** `ParsedQueryParams | null`

**New ParsedQueryParams fields:**

- `documents: boolean` - Whether to return full data without pagination metadata
- `pagination: boolean` - Whether to return explicit pagination format
- `count: boolean` - Whether to return count information

### `createFormattedResponse<T>(data, total, page, limit, formatOptions, entityType, dataKey, summaryFunction?)`

Creates appropriate response format based on the format options.

**Parameters:**

- `formatOptions: ResponseFormatOptions` - Object with `{ documents, pagination, count }` flags
- `summaryFunction?: (data: T[]) => any[]` - Optional function (not used by default, available for custom implementations)

**Format Priority:**

1. If `count && documents && pagination` → Returns full data with count and pagination metadata
2. If `count && documents && !pagination` → Returns full data with count only
3. If `count && pagination && !documents` → Returns pagination metadata and count (no data, optimized)
4. If `count && !documents && !pagination` → Returns count only (optimized)
5. If `documents && !count && !pagination` → Returns full data without pagination metadata
6. If `pagination && !count && !documents` → Returns paginated format with metadata and full data

### `buildFieldSelection(fields: string)`

Builds Prisma select object from comma-separated field string.

**Example:**

```typescript
// Input: "id,name,user.email,user.profile.firstName"
// Output: { id: true, name: true, user: { select: { email: true, profile: { select: { firstName: true } } } } }
````

### `buildOrderBy(sort?, order?)`

Builds Prisma orderBy object from sort and order parameters.

**Examples:**

```typescript
buildOrderBy("name", "asc"); // { name: "asc" }
buildOrderBy('{"name": "asc", "createdAt": "desc"}'); // { name: "asc", createdAt: "desc" }
```

### `buildFilterConditions<T>(filters: any[])`

Builds array of where conditions from filter objects. Supports nested field filtering.

**Example filter:**

```json
[
	{ "status": "active" },
	{ "user.email": { "contains": "@company.com" } },
	{ "createdAt": { "gte": "2023-01-01" } }
]
```

## Supported Query Parameters

| Parameter                         | Type        | Description                                      | Example                                       |
| --------------------------------- | ----------- | ------------------------------------------------ | --------------------------------------------- |
| `page`                            | number      | Page number (1-based)                            | `?page=2`                                     |
| `limit`                           | number      | Items per page                                   | `?limit=20`                                   |
| `sort`                            | string      | Sort field or JSON object                        | `?sort=name` or `?sort={"name":"asc"}`        |
| `order`                           | string      | Sort direction (asc/desc)                        | `?order=desc`                                 |
| `fields`                          | string      | Comma-separated fields to select                 | `?fields=id,name,user.email`                  |
| `query`                           | string      | Basic search query                               | `?query=john`                                 |
| `filter`                          | string      | JSON array of filter objects                     | `?filter=[{"status":"active"}]`               |
| **`documents`** or **`document`** | **boolean** | **Return full data without pagination metadata** | **`?documents=true`** or **`?document=true`** |
| **`pagination`**                  | **boolean** | **Return paginated format**                      | **`?pagination=true`**                        |
| **`count`**                       | **boolean** | **Return count information**                     | **`?count=true`**                             |

## Advanced Filtering

The filter parameter supports complex filtering with nested fields:

```typescript
// URL: ?filter=[{"user.profile.firstName":{"contains":"John"}},{"status":"active"}]
// This creates an OR condition between the filters
```

For nested Prisma relations that require special syntax (like `is` for one-to-one relations), you should handle the search logic manually in your controller rather than using the generic `buildBasicSearchConditions`.

## Migration Guide

To migrate existing `getAll` functions:

1. Import the utility functions including `createFormattedResponse` and `ResponseFormatOptions`
2. Replace manual validation with `handleQueryValidation`
3. Extract `documents`, `pagination`, `count` from parsed parameters
4. Add performance optimization for count-only queries
5. Replace field selection logic with `buildFieldSelection`
6. Replace orderBy logic with `buildOrderBy`
7. Create a summary function for documents format
8. Replace response creation with `createFormattedResponse`

**Before:**

```typescript
const response = createPaginatedResponse(data, total, page, limit, "dataKey");
res.status(200).json({
	status: "success",
	message: "Data retrieved successfully",
	data: response,
});
```

**After:**

```typescript
const formatOptions: ResponseFormatOptions = { documents, pagination, count };
const response = createFormattedResponse(
	data,
	total,
	page,
	limit,
	formatOptions,
	"entityType",
	"dataKey",
	createSummaryFunction,
);
res.status(200).json(response);
```
