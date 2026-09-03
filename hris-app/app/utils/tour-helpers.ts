/**
 * Tour Guide Helper Utilities
 * 
 * Utilities for determining when to show the tour guide based on employee data.
 * Tour guide is completely independent from the boarding process system.
 */

export interface EmployeeForTour {
	employmentStatus?: string;
	employmentType?: string;
	isTour?: boolean;
}

/**
 * Determines if the tour guide should be hidden for an employee
 * 
 * Tour Visibility Rules:
 * - SHOW tour (return false) if ALL of the following are true:
 *   1. employmentStatus === "ONBOARDING"
 *   2. employmentType === "PROBATIONARY"
 *   3. isTour === false (employee hasn't completed the tour yet)
 * - HIDE tour (return true) for all other cases
 * 
 * Note: When isTour field doesn't exist or is false, it means the employee 
 * hasn't finished the tour yet and should see it.
 * 
 * The tour guide is completely separate from the boarding process (task assignment system).
 * It is driven purely by employee role, status, and tour completion state.
 * 
 * @param employee - Employee data with employmentStatus, employmentType, and isTour
 * @returns true if tour should be HIDDEN, false if tour should be SHOWN
 */
export function shouldHideTour(employee?: EmployeeForTour | null): boolean {
	if (!employee) {
		return true; // Hide tour if no employee data
	}

	const { employmentStatus, employmentType, isTour } = employee;

	// Check all three conditions for showing the tour
	const isOnboarding = employmentStatus === "ONBOARDING";
	const isProbationary = employmentType === "PROBATIONARY";
	const hasNotCompletedTour = isTour === false;

	// Return true to HIDE tour, false to SHOW tour
	// Show tour when all three conditions are met
	return !(isOnboarding && isProbationary && hasNotCompletedTour);
}
