# Controller Template Documentation

This document serves as a template for implementing consistent REST API endpoints with common patterns for pagination, searching, sorting, and field selection.

## Query Parameter Usage Examples

1. Basic Pagination

```
GET /resource?page=1&limit=10
```

2. Search

```
GET /resource?query=searchterm
```

3. Sort by Field

```
GET /resource?sort=fieldName&order=asc
```

4. Complex Sort

```
GET /resource?sort={"field1":"asc","field2":"desc"}
```

5. Field Selection

```
GET /resource?populate=field1,field2,field3
```

6. Combined Usage

```
GET /resource?page=1&limit=10&query=searchterm&sort=fieldName&order=asc&populate=field1,field2
```

# API Usage Template

This document provides examples of how to use and test standard REST API endpoints that follow our common patterns.

## Base URL

```
http://localhost:3000/api/[resource]
```

Replace `[resource]` with your specific resource (e.g., users, products, orders)

## Endpoints Usage Guide

### 1. Get All Records

#### Basic Request

```http
GET /api/[resource]
```

#### Available Query Parameters

| Parameter | Example Value | Description         |
| --------- | ------------- | ------------------- |
| page      | 1             | Current page number |
| limit     | 10            | Items per page      |
| query     | john          | Search term         |
| sort      | firstName     | Field to sort by    |
| order     | asc           | Sort direction      |
| populate  | name,email    | Fields to include   |

#### Example Requests in Postman

1. Basic Pagination

```http
GET /api/users?page=1&limit=10
```

Response:

```json
{
    "users": [...],
    "total": 50,
    "page": 1,
    "totalPages": 5
}
```

2. Search with Pagination

```http
GET /api/users?query=john&page=1&limit=10
```

Response:

```json
{
	"users": [
		{
			"id": "123",
			"firstName": "John",
			"lastName": "Doe",
			"email": "john@example.com"
		}
	],
	"total": 1,
	"page": 1,
	"totalPages": 1
}
```

3. Sort Results

```http
GET /api/users?sort=firstName&order=asc
```

4. Complex Sort (Multiple Fields)

```http
GET /api/users?sort={"firstName":"asc","lastName":"desc"}
```

5. Select Specific Fields

```http
GET /api/users?populate=firstName,lastName,email
```

6. Combined Example

```http
GET /api/users?page=1&limit=10&query=john&sort=firstName&order=asc&populate=firstName,lastName,email
```

### 2. Get Single Record

#### Basic Request

```http
GET /api/[resource]/:id
```

#### Examples

1. Get Basic Record

```http
GET /api/users/123
```

Response:

```json
{
	"id": "123",
	"firstName": "John",
	"lastName": "Doe"
}
```

2. Get Record with Specific Fields

```http
GET /api/users/123?populate=firstName,lastName,email
```

Response:

```json
{
	"id": "123",
	"firstName": "John",
	"lastName": "Doe",
	"email": "john@example.com"
}
```

### 3. Update Record

#### Basic Request

```http
PUT /api/[resource]/:id
Content-Type: application/json

{
    "field1": "value1",
    "field2": "value2"
}
```

#### Examples

1. Update User

```http
PUT /api/users/123
Content-Type: application/json

{
    "firstName": "John",
    "lastName": "Smith"
}
```

Response:

```json
{
	"id": "123",
	"firstName": "John",
	"lastName": "Smith",
	"email": "john@example.com"
}
```

2. Partial Update

```http
PUT /api/users/123
Content-Type: application/json

{
    "firstName": "Johnny"
}
```

### 4. Delete Record

#### Basic Request

```http
DELETE /api/[resource]/:id
```

#### Example

```http
DELETE /api/users/123
```

Response:

```json
{
	"message": "Record deleted successfully"
}
```

## Error Responses

All endpoints return consistent error responses:

1. Invalid Input

```json
{
	"error": "Invalid page number"
}
```

2. Not Found

```json
{
	"error": "Record not found"
}
```

3. Validation Error

```json
{
	"error": "Invalid email address format"
}
```

## Testing Tips

1. Always test pagination with different page sizes
2. Try searching with partial matches
3. Test sorting with both single and multiple fields
4. Verify error responses with invalid inputs
5. Test field selection with different combinations
6. Ensure proper error handling for non-existent records
