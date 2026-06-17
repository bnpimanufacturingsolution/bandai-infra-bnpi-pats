import type { Application } from "~/types/application";

const STORAGE_KEY = "job-applications";

export function getApplications(): Application[] {
	if (typeof window === "undefined") return [];
	const data = localStorage.getItem(STORAGE_KEY);
	return data ? JSON.parse(data) : [];
}

export function saveApplication(
	application: Omit<Application, "id" | "createdAt" | "updatedAt" | "status" | "notes">,
): Application {
	const applications = getApplications();
	const newApplication: Application = {
		...application,
		id: crypto.randomUUID(),
		status: "APPLICATION_SUBMITTED",
		notes: "",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
	applications.push(newApplication);
	localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
	return newApplication;
}

export function updateApplication(id: string, updates: Partial<Application>): Application | null {
	const applications = getApplications();
	const index = applications.findIndex((app) => app.id === id);
	if (index === -1) return null;

	applications[index] = {
		...applications[index],
		...updates,
		updatedAt: new Date().toISOString(),
	};
	localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
	return applications[index];
}
