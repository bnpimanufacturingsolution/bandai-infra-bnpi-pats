const PUBLIC_UNAUTHENTICATED_API_PATHS = new Set([
	"/calendar-item/public/kiosk",
	"/celebrations/public/birthdays",
]);

/**
 * Returns true only for API routes whose response is intentionally available
 * before an employee signs in. Keep this list exact so neighboring module
 * routes remain protected by the global token middleware.
 */
export const isPublicUnauthenticatedApiPath = (requestPath: string): boolean =>
	PUBLIC_UNAUTHENTICATED_API_PATHS.has(requestPath);

