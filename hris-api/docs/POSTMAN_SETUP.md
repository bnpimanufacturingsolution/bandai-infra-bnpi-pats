# Postman Collection Setup Guide

This guide will help you set up and use the Postman collection for the OneBis API.

## Prerequisites

1. Postman installed on your machine
2. The API server running locally or on a remote server
3. Database seeded with default data

## Environment Setup

### 1. Import the Collection

- Open Postman
- Click "Import" button
- Select the `Sure One.postman_collection.json` file from the project root

### 2. Set Environment Variables

Create a new environment in Postman with the following variables:

| Variable   | Value                   | Description                 |
| ---------- | ----------------------- | --------------------------- |
| `base_url` | `http://localhost:3000` | Base URL of your API server |

### 3. Seed the Database

Before testing, make sure to seed the database with default data:

```bash
npx prisma db seed
```

This creates:

- Default Organization (ID: `67c7064d13d130902d5877cb`)
- Default Person (ID: `67c7064d13d130902d5877cc`)
- Default User (ID: `67c7064d13d130902d5877ca`)
    - Email: `maik@1BIS.com`
    - Password: `123456`
    - Role: `super_admin`

## API Endpoints

### Authentication

#### 1. Register New User

- **Endpoint**: `POST /api/auth/register`
- **Description**: Register a new user with person details
- **Required Fields**:
    - `email` (string): User's email address
    - `password` (string): User's password (min 6 characters)
    - `firstName` (string): First name
    - `lastName` (string): Last name
    - `organizationId` (string): Organization ID (use default: `67c7064d13d130902d5877cb`)

**Example Request Body**:

```json
{
	"email": "dariel@example.com",
	"password": "password123",
	"userName": "dar",
	"role": "admin",
	"subRole": "staff",
	"firstName": "John",
	"lastName": "Doe",
	"organizationId": "67c7064d13d130902d5877cb",
	"personalInfo": {
		"firstName": "John",
		"lastName": "Doe",
		"dateOfBirth": "1990-01-01T00:00:00.000Z",
		"placeOfBirth": "New York",
		"age": 33,
		"nationality": "American",
		"primaryLanguage": "English",
		"gender": "male"
	},
	"contactInfo": {
		"email": "dariel@example.com",
		"phones": [
			{
				"type": "mobile",
				"countryCode": "+1",
				"number": "234567890",
				"isPrimary": true
			}
		],
		"address": {
			"street": "Main St",
			"city": "Sample City",
			"state": "Sample Province",
			"country": "USA",
			"postalCode": "12345",
			"zipCode": "12345",
			"houseNumber": "123"
		}
	},
	"identification": {
		"type": "drivers_license",
		"number": "DL123456789",
		"issuingCountry": "USA",
		"expiryDate": "2025-12-31T00:00:00.000Z"
	}
}
```

#### 2. Login

- **Endpoint**: `POST /api/auth/login`
- **Description**: Login with email and password
- **Required Fields**:
    - `email` (string): User's email
    - `password` (string): User's password

**Example Request Body**:

```json
{
	"email": "maik@1BIS.com",
	"password": "123456"
}
```

**Response**: Sets an HTTP-only cookie with JWT token for authentication.

### User Management

#### 3. Get Current User

- **Endpoint**: `GET /api/user/current`
- **Description**: Get the currently authenticated user's information
- **Authentication**: Required (cookie-based)

#### 4. Get User by ID

- **Endpoint**: `GET /api/user/{id}`
- **Description**: Get a specific user by ID
- **Authentication**: Required

#### 5. Get All Users

- **Endpoint**: `GET /api/user`
- **Description**: Get all users with pagination
- **Authentication**: Required
- **Query Parameters**:
    - `page` (number): Page number (default: 1)
    - `limit` (number): Items per page (default: 10)
    - `fields` (string): Comma-separated fields to select

#### 6. Update User

- **Endpoint**: `PATCH /api/user/{id}`
- **Description**: Update user information
- **Authentication**: Required

#### 7. Delete User (Soft Delete)

- **Endpoint**: `PUT /api/user/{id}`
- **Description**: Soft delete a user
- **Authentication**: Required

## Testing Workflow

1. **Start the API server**:

    ```bash
    npm run dev
    ```

2. **Test Authentication**:

    - Use "Auth Login (Seeded User)" to login with the default user
    - This will set the authentication cookie

3. **Test Current User**:

    - Use "Get Current User" to verify the authentication works
    - Should return the logged-in user's information

4. **Test Registration**:

    - Use "Auth Register" to create a new user
    - Modify the email and other details as needed

5. **Test User Management**:
    - Use other user endpoints to test CRUD operations

## Data Models

### User Model

- `id`: ObjectId
- `email`: Unique email address
- `userName`: Unique username
- `password`: Hashed password
- `role`: `super_admin`, `admin`, or `user`
- `subRole`: `staff`, `guard`, `vendor`, `operator`, `manager`, `guest`, `facilityUser`
- `status`: `active`, `inactive`, `suspended`, `archived`
- `personId`: Reference to Person model
- `organizationId`: Reference to Organization model

### Person Model

- `personalInfo`: First name, last name, date of birth, etc.
- `contactInfo`: Email, phones, address
- `identification`: ID type, number, issuing country, expiry date
- `metadata`: Active status, creation info, etc.

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Make sure you're logged in and the cookie is set
2. **400 Bad Request**: Check required fields in the request body
3. **404 Not Found**: Verify the endpoint URL and user IDs
4. **500 Internal Server Error**: Check server logs for detailed error information

### Debug Tips

- Check the browser's developer tools for cookie information
- Verify the `base_url` environment variable is correct
- Ensure the database is properly seeded
- Check server logs for detailed error messages
