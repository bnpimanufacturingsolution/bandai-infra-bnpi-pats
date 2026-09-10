/**
 * Registry for applications the HRIS launcher can open.
 *
 * User-facing display names differ from internal identifiers
 * (Trainings -> LMS, Performance -> EPMR). The launcher uses this
 * registry for labels; the /application-launch page uses it to
 * validate the ?app= parameter and resolve the display name.
 * Navigation itself is handled by the existing external-launch
 * auth bridge (see lib/external-launch.ts).
 */

export type LaunchableApplicationId = "lms" | "epmr";

export interface LaunchableApplication {
	id: LaunchableApplicationId;
	displayName: string;
}

export const LAUNCHABLE_APPLICATIONS: LaunchableApplication[] = [
	{ id: "lms", displayName: "Trainings" },
	{ id: "epmr", displayName: "Performance" },
];

export function getLaunchableApplication(
	id: string | null | undefined,
): LaunchableApplication | null {
	if (!id) return null;
	return LAUNCHABLE_APPLICATIONS.find((app) => app.id === id) ?? null;
}
