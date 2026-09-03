import type {
	ContactInfoType,
	CreatePersonType,
	IdentificationType,
	MetadataType,
	Person,
	PersonalInfoType,
	UpdatePersonType,
} from "~/zod/person.zod";
import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface CreatePersonRequest extends CreatePersonType {}

export interface UpdatePersonRequest extends UpdatePersonType {}

interface PersonsResponse {
	data: Person[] | { persons: Person[] };
	pagination?: {
		total: number;
		page: number;
		limit: number;
	};
}

const createPersonServiceError = (error: any, fallback: string) => {
	const message =
		error?.errors?.[0]?.message ||
		error?.data?.errors?.[0]?.message ||
		error?.message ||
		fallback;
	const serviceError = new Error(message) as Error & {
		errors?: Array<{ field?: string; message: string }>;
		data?: unknown;
		status?: number;
	};

	if (Array.isArray(error?.errors)) {
		serviceError.errors = error.errors;
	}
	if (error?.data !== undefined) {
		serviceError.data = error.data;
	}
	if (typeof error?.status === "number") {
		serviceError.status = error.status;
	}

	return serviceError;
};

class PersonService extends APIService {
	/**
	 * Get all persons with optional filtering, pagination, and sorting
	 * @returns Promise<PersonsResponse> - Persons response with pagination
	 */
	async getPersons(): Promise<PersonsResponse> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<PersonsResponse>(`/api/person${queryString}`);
			return (response.data || response) as PersonsResponse;
		} catch (error: any) {
			console.error("Error fetching persons:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching persons",
			);
		}
	}

	/**
	 * Get person by ID with optional field selection
	 * @param personId Person ID
	 * @returns Promise<Person> - Person data
	 */
	async getPersonById(personId: string): Promise<Person> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<Person>(
				`/api/person/${personId}${queryString}`,
			);
			if (!response.data) {
				throw new Error("Person not found");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error fetching person:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error fetching person",
			);
		}
	}

	/**
	 * Get person by user ID
	 * @param userId User ID
	 * @returns Promise<Person> - Person data
	 */
	async getPersonByUserId(userId: string): Promise<Person> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<PersonsResponse>(
				`/api/person?userId=${userId}${queryString}`,
			);
			const data = (response.data || response) as PersonsResponse;
			const persons = Array.isArray(data.data) ? data.data : data.data.persons || [];

			if (persons.length === 0) {
				throw new Error("Person not found for user");
			}
			return persons[0];
		} catch (error: any) {
			console.error("Error fetching person by user ID:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching person by user ID",
			);
		}
	}

	/**
	 * Get person by employee ID
	 * @param employeeId Employee ID
	 * @returns Promise<Person> - Person data
	 */
	async getPersonByEmployeeId(employeeId: string): Promise<Person> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<PersonsResponse>(
				`/api/person?employeeId=${employeeId}${queryString}`,
			);
			const data = (response.data || response) as PersonsResponse;
			const persons = Array.isArray(data.data) ? data.data : data.data.persons || [];

			if (persons.length === 0) {
				throw new Error("Person not found for employee");
			}
			return persons[0];
		} catch (error: any) {
			console.error("Error fetching person by employee ID:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching person by employee ID",
			);
		}
	}

	/**
	 * Create a new person
	 * @param data Person creation data
	 * @returns Promise<Person> - Created person data
	 */
	async createPerson(data: CreatePersonRequest): Promise<{ person: Person }> {
		try {
			const response = await hrisApiClient.post<{ person: Person }>("/api/person", data);
			if (!response.data) {
				throw new Error("Failed to create person");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error creating person:", error);
			throw createPersonServiceError(error, "Error creating person");
		}
	}

	/**
	 * Update an existing person
	 * @param personId Person ID
	 * @param data Person update data
	 * @returns Promise<Person> - Updated person data
	 */
	async updatePerson(personId: string, data: UpdatePersonRequest): Promise<Person> {
		try {
			const response = await hrisApiClient.patch<Person>(`/api/person/${personId}`, data);
			if (!response.data) {
				throw new Error("Failed to update person");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating person:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating person",
			);
		}
	}

	/**
	 * Delete a person (soft delete using DELETE)
	 * @param personId Person ID
	 * @returns Promise<void>
	 */
	async deletePerson(personId: string): Promise<void> {
		try {
			await hrisApiClient.delete(`/api/person/${personId}`);
		} catch (error: any) {
			console.error("Error deleting person:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error deleting person",
			);
		}
	}

	/**
	 * Get persons by organization ID
	 * @param organizationId Organization ID
	 * @param params Optional query parameters
	 * @returns Promise<PersonsResponse> - Persons response
	 */
	async getPersonsByOrganization(
		organizationId: string,
		params?: ApiQueryParams,
	): Promise<PersonsResponse> {
		try {
			const queryString = this.getQueryString();
			const response = await hrisApiClient.get<PersonsResponse>(
				`/api/person?organizationId=${organizationId}${queryString}`,
			);
			return (response.data || response) as PersonsResponse;
		} catch (error: any) {
			console.error("Error fetching organization persons:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error fetching organization persons",
			);
		}
	}

	/**
	 * Get persons with specific parameters
	 * @param params Query parameters
	 * @returns Promise<PersonsResponse> - Persons response
	 */
	async getPersonsWithParams(params: ApiQueryParams): Promise<PersonsResponse> {
		return this.setParams(params).getPersons();
	}

	/**
	 * Search persons by name or email
	 * @param query Search term
	 * @param params Optional query parameters
	 * @returns Promise<PersonsResponse> - Persons response
	 */
	async searchPersons(query: string, params?: ApiQueryParams): Promise<PersonsResponse> {
		return this.search(query)
			.setParams(params || {})
			.getPersons();
	}

	/**
	 * Get persons grouped by a specific field
	 * @param groupBy Field to group by
	 * @param params Optional query parameters
	 * @returns Promise<PersonsResponse> - Persons response
	 */
	async getPersonsGrouped(groupBy: string, params?: ApiQueryParams): Promise<PersonsResponse> {
		return this.setParams({
			...params,
			groupBy,
		}).getPersons();
	}

	/**
	 * Update person personal info
	 * @param personId Person ID
	 * @param personalInfo Personal info object to update
	 * @returns Promise<Person> - Updated person data
	 */
	async updatePersonalInfo(
		personId: string,
		personalInfo: Partial<PersonalInfoType>,
	): Promise<Person> {
		try {
			const response = await hrisApiClient.patch<Person>(`/api/person/${personId}`, {
				personalInfo,
			});
			if (!response.data) {
				throw new Error("Failed to update personal info");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating personal info:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating personal info",
			);
		}
	}

	/**
	 * Update person contact info
	 * @param personId Person ID
	 * @param contactInfo Contact info object to update
	 * @returns Promise<Person> - Updated person data
	 */
	async updateContactInfo(
		personId: string,
		contactInfo: Partial<ContactInfoType>,
	): Promise<Person> {
		try {
			const response = await hrisApiClient.patch<Person>(`/api/person/${personId}`, {
				contactInfo,
			});
			if (!response.data) {
				throw new Error("Failed to update contact info");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating contact info:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating contact info",
			);
		}
	}

	/**
	 * Update person identification
	 * @param personId Person ID
	 * @param identification Identification object to update
	 * @returns Promise<Person> - Updated person data
	 */
	async updateIdentification(
		personId: string,
		identification: Partial<IdentificationType>,
	): Promise<Person> {
		try {
			const response = await hrisApiClient.patch<Person>(`/api/person/${personId}`, {
				identification,
			});
			if (!response.data) {
				throw new Error("Failed to update identification");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating identification:", error);
			throw new Error(
				error.data?.errors?.[0]?.message ||
					error.message ||
					"Error updating identification",
			);
		}
	}

	/**
	 * Update person metadata
	 * @param personId Person ID
	 * @param metadata Metadata object to update
	 * @returns Promise<Person> - Updated person data
	 */
	async updateMetadata(personId: string, metadata: Partial<MetadataType>): Promise<Person> {
		try {
			const response = await hrisApiClient.patch<Person>(`/api/person/${personId}`, {
				metadata,
			});
			if (!response.data) {
				throw new Error("Failed to update metadata");
			}
			return response.data;
		} catch (error: any) {
			console.error("Error updating metadata:", error);
			throw new Error(
				error.data?.errors?.[0]?.message || error.message || "Error updating metadata",
			);
		}
	}

	/**
	 * Get active persons only
	 * @param params Optional query parameters
	 * @returns Promise<PersonsResponse> - Active persons response
	 */
	async getActivePersons(params?: ApiQueryParams): Promise<PersonsResponse> {
		return this.setParams({
			...params,
			filter: { "metadata.isActive": true },
		}).getPersons();
	}

	/**
	 * Get persons by nationality
	 * @param nationality Nationality to filter by
	 * @param params Optional query parameters
	 * @returns Promise<PersonsResponse> - Persons response
	 */
	async getPersonsByNationality(
		nationality: string,
		params?: ApiQueryParams,
	): Promise<PersonsResponse> {
		return this.setParams({
			...params,
			filter: { "personalInfo.nationality": nationality },
		}).getPersons();
	}
}

// Export singleton instance
const personService = new PersonService();
export default personService;
