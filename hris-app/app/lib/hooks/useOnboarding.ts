import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import onboardingService from "~/services/onboarding.service";
import type {
	CreateOnboardingChecklistPayload,
	ReplaceTemplateTreePayload,
	SignOnboardingItemPayload,
} from "~/zod/onboarding";

export const onboardingQueryKeys = {
	all: ["onboarding"] as const,
	roster: () => [...onboardingQueryKeys.all, "roster"] as const,
	visibleChecklist: (id: string) => [...onboardingQueryKeys.all, "visible", id] as const,
	templates: () => [...onboardingQueryKeys.all, "templates"] as const,
	template: (id: string) => [...onboardingQueryKeys.all, "template", id] as const,
};

export const useOnboardingRoster = (options?: {
	enabled?: boolean;
	search?: string;
	departmentId?: string;
	page?: number;
}) =>
	useQuery({
		queryKey: [
			...onboardingQueryKeys.roster(),
			{
				search: options?.search ?? "",
				departmentId: options?.departmentId ?? "",
				page: options?.page ?? 1,
			},
		],
		queryFn: () =>
			onboardingService.getRoster({
				search: options?.search,
				departmentId: options?.departmentId,
				page: options?.page,
			}),
		enabled: options?.enabled ?? true,
		staleTime: 30 * 1000,
	});

/** Roster lookup for one employee (works for every authenticated role). */
export const useOnboardingRosterForEmployee = (employeeNumber: string | null) =>
	useQuery({
		queryKey: [...onboardingQueryKeys.roster(), "employee", employeeNumber],
		queryFn: () => onboardingService.getRoster({ search: employeeNumber ?? "" }),
		enabled: !!employeeNumber,
		staleTime: 15 * 1000,
	});

/** Checklist-instance list (admin/HR only endpoint; callers must gate). */
export const useOnboardingChecklistsForEmployee = (employeeId: string | null, enabled: boolean) =>
	useQuery({
		queryKey: [...onboardingQueryKeys.all, "checklists-for", employeeId],
		queryFn: () => onboardingService.listChecklists(employeeId ?? undefined),
		enabled: !!employeeId && enabled,
		staleTime: 15 * 1000,
		retry: false,
	});

export const useOnboardingVisibleChecklist = (checklistId: string | null) =>
	useQuery({
		queryKey: onboardingQueryKeys.visibleChecklist(String(checklistId)),
		queryFn: () => onboardingService.getVisibleChecklist(String(checklistId)),
		enabled: !!checklistId,
		staleTime: 5 * 1000,
	});

export const useSignOnboardingItem = (checklistId: string | null) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ itemId, payload }: { itemId: string; payload: SignOnboardingItemPayload }) =>
			onboardingService.signItem(itemId, payload),
		retry: false,
		onSuccess: () => {
			if (checklistId) {
				queryClient.invalidateQueries({
					queryKey: onboardingQueryKeys.visibleChecklist(checklistId),
				});
			}
			queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.roster() });
			sonnerToast.success("Item signed");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to sign item");
		},
	});
};

export const useUnsignOnboardingItem = (checklistId: string | null) => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ itemId, reason }: { itemId: string; reason?: string }) =>
			onboardingService.unsignItem(itemId, reason),
		retry: false,
		onSuccess: () => {
			if (checklistId) {
				queryClient.invalidateQueries({
					queryKey: onboardingQueryKeys.visibleChecklist(checklistId),
				});
			}
			queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.roster() });
			sonnerToast.success("Signature reverted");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to unsign item");
		},
	});
};

export const useOnboardingTemplates = (options?: { enabled?: boolean }) =>
	useQuery({
		queryKey: onboardingQueryKeys.templates(),
		queryFn: () => onboardingService.listTemplates(),
		enabled: options?.enabled ?? true,
		staleTime: 60 * 1000,
	});

export const useOnboardingTemplate = (templateId: string | null) =>
	useQuery({
		queryKey: onboardingQueryKeys.template(String(templateId)),
		queryFn: () => onboardingService.getTemplate(String(templateId)),
		enabled: !!templateId,
		staleTime: 10 * 1000,
	});

export const useSaveOnboardingTemplateTree = () => {
	const queryClient = useQueryClient();
	return useMutation({
		retry: false,
		mutationFn: async ({
			templateId,
			payload,
	}: {
			templateId: string | null;
			payload: ReplaceTemplateTreePayload;
		}) => {
			const targetId = templateId || (await onboardingService.createTemplate(payload.name || "Onboarding Template")).template.id;
			return onboardingService.replaceTemplateTree(targetId, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.templates() });
			queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.all });
			sonnerToast.success("Template saved");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to save template");
		},
	});
};

export const useCreateOnboardingChecklist = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: CreateOnboardingChecklistPayload) =>
			onboardingService.createChecklist(payload),
		retry: false,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.roster() });
			queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.all });
			sonnerToast.success("Checklist created");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create checklist");
		},
	});
};
