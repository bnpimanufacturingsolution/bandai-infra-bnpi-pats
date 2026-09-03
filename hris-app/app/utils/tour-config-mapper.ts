import type { TourStep } from "~/components/organisms/tour/ProductTourProvider";
import { employeeTourConfig } from "~/config/employee-tour.config";
import { managerTourConfig } from "~/config/manager-tour.config";
import { hrManagerTourConfig } from "~/config/hr-manager-tour.config";
import { hrUserTourConfig } from "~/config/hr-user-tour.config";

/**
 * Maps user roles to their respective tour configurations
 * @param role - The user's role from the authentication context
 * @returns The appropriate tour configuration for the role
 */
export function getTourConfigByRole(role?: string): TourStep[] {
	if (!role) {
		return employeeTourConfig; // Default to employee tour
	}

	const roleLower = role.toLowerCase();

	// Map roles to their respective tour configs
	if (roleLower.includes("manager") && roleLower.includes("hr")) {
		return hrManagerTourConfig;
	}

	if (roleLower.includes("hr") && roleLower.includes("user")) {
		return hrUserTourConfig;
	}

	if (roleLower.includes("manager")) {
		return managerTourConfig;
	}

	// Default to employee tour for regular employees or unknown roles
	return employeeTourConfig;
}

/**
 * Checks if the tour should be triggered based on employee conditions
 * @param employmentStatus - Employee's current employment status
 * @param employmentType - Employee's employment type
 * @param isTour - Whether the employee has already taken the tour (false = not taken yet)
 * @returns true if the tour should be triggered
 */
export function shouldTriggerTour(
	employmentStatus?: string,
	employmentType?: string,
	isTour?: boolean,
): boolean {
	// Tour should trigger if:
	// 1. Employee is in ONBOARDING status
	// 2. Employee is PROBATIONARY type
	// 3. Employee hasn't taken the tour yet (isTour is false or undefined)
	const isOnboarding = employmentStatus === "ONBOARDING";
	const isProbationary = employmentType === "PROBATIONARY";
	const hasNotTakenTour = isTour !== true; // Will trigger if false or undefined

	return isOnboarding && isProbationary && hasNotTakenTour;
}
