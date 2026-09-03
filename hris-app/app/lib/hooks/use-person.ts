import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";
import personService, {
	type CreatePersonRequest,
	type UpdatePersonRequest,
} from "~/services/person.serivce";
import type {
	ContactInfoType,
	IdentificationType,
	MetadataType,
	PersonalInfoType,
} from "~/zod/person.zod";

// Query keys
export const personKeys = {
	all: ["persons"] as const,
	lists: () => [...personKeys.all, "list"] as const,
	list: (params?: ApiQueryParams) => [...personKeys.lists(), { params }] as const,
	details: () => [...personKeys.all, "detail"] as const,
	detail: (id: string) => [...personKeys.details(), id] as const,
	byUser: (userId: string) => [...personKeys.all, "byUser", userId] as const,
	byEmployee: (employeeId: string) => [...personKeys.all, "byEmployee", employeeId] as const,
	byOrganization: (organizationId: string, params?: ApiQueryParams) =>
		[...personKeys.all, "byOrganization", organizationId, { params }] as const,
};

// Get all persons
export function usePersons(params?: ApiQueryParams) {
	return useQuery({
		queryKey: personKeys.list(params),
		queryFn: () => {
			return personService
				.clearQueryParams()
				.select(params?.fields)
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getPersons();
		},
		select: (data) => {
			// Handle different response structures
			if (Array.isArray(data.data)) {
				return { ...data, persons: data.data };
			}
			if (data.data && "persons" in data.data) {
				return { ...data, persons: data.data.persons };
			}
			return data;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// Get person by ID
export function usePerson(id: string, enabled = true) {
	return useQuery({
		queryKey: personKeys.detail(id),
		queryFn: () => personService.getPersonById(id),
		enabled: enabled && !!id,
	});
}

// Get person by user ID
export function usePersonByUserId(userId: string, enabled = true) {
	return useQuery({
		queryKey: personKeys.byUser(userId),
		queryFn: () => personService.getPersonByUserId(userId),
		enabled: enabled && !!userId,
	});
}

// Get person by employee ID
export function usePersonByEmployeeId(employeeId: string, enabled = true) {
	return useQuery({
		queryKey: personKeys.byEmployee(employeeId),
		queryFn: () => personService.getPersonByEmployeeId(employeeId),
		enabled: enabled && !!employeeId,
	});
}

// Get persons by organization
export function usePersonsByOrganization(organizationId: string, params?: ApiQueryParams) {
	return useQuery({
		queryKey: personKeys.byOrganization(organizationId, params),
		queryFn: () => personService.getPersonsByOrganization(organizationId, params),
		enabled: !!organizationId,
		select: (data) => {
			// Handle different response structures
			if (Array.isArray(data.data)) {
				return { ...data, persons: data.data };
			}
			if (data.data && "persons" in data.data) {
				return { ...data, persons: data.data.persons };
			}
			return data;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// Create person mutation
export function useCreatePerson() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreatePersonRequest) => personService.createPerson(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: personKeys.lists() });
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to create person");
		},
	});
}

// Update person mutation
export function useUpdatePerson() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdatePersonRequest }) =>
			personService.updatePerson(id, data),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: personKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: personKeys.lists() });
			toast.success("Person updated successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to update person");
		},
	});
}

// Delete person mutation
export function useDeletePerson() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => personService.deletePerson(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: personKeys.lists() });
			toast.success("Person deleted successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to delete person");
		},
	});
}

// Update person personal info mutation
export function useUpdatePersonalInfo() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Partial<PersonalInfoType> }) =>
			personService.updatePersonalInfo(id, data),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: personKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: personKeys.lists() });
			toast.success("Personal info updated successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to update personal info");
		},
	});
}

// Update person contact info mutation
export function useUpdateContactInfo() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Partial<ContactInfoType> }) =>
			personService.updateContactInfo(id, data),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: personKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: personKeys.lists() });
			toast.success("Contact info updated successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to update contact info");
		},
	});
}

// Update person identification mutation
export function useUpdateIdentification() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Partial<IdentificationType> }) =>
			personService.updateIdentification(id, data),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: personKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: personKeys.lists() });
			toast.success("Identification updated successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to update identification");
		},
	});
}

// Update person metadata mutation
export function useUpdatePersonMetadata() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Partial<MetadataType> }) =>
			personService.updateMetadata(id, data),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: personKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: personKeys.lists() });
			toast.success("Metadata updated successfully");
		},
		onError: (error: any) => {
			toast.error(error.message || "Failed to update metadata");
		},
	});
}

// Get active persons
export function useActivePersons(params?: ApiQueryParams) {
	return useQuery({
		queryKey: [...personKeys.lists(), "active", { params }],
		queryFn: () => personService.getActivePersons(params),
		select: (data) => {
			// Handle different response structures
			if (Array.isArray(data.data)) {
				return { ...data, persons: data.data };
			}
			if (data.data && "persons" in data.data) {
				return { ...data, persons: data.data.persons };
			}
			return data;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// Get persons by nationality
export function usePersonsByNationality(nationality: string, params?: ApiQueryParams) {
	return useQuery({
		queryKey: [...personKeys.lists(), "nationality", nationality, { params }],
		queryFn: () => personService.getPersonsByNationality(nationality, params),
		enabled: !!nationality,
		select: (data) => {
			// Handle different response structures
			if (Array.isArray(data.data)) {
				return { ...data, persons: data.data };
			}
			if (data.data && "persons" in data.data) {
				return { ...data, persons: data.data.persons };
			}
			return data;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

