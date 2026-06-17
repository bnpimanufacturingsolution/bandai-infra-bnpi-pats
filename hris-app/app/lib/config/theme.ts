/**
 * Theme Configuration
 *
 * Centralized theme configuration for the application.
 * Modify these values to change the theme colors throughout the app.
 */

export interface ThemeColors {
	red: string;
	orange: string;
	yellow: string;
	rose?: string;
	blue?: string;
	blueLight?: string;
	// Light versions for backgrounds
	redLight?: string;
	orangeLight?: string;
	yellowLight?: string;
}

export interface ThemeConfig {
	colors: ThemeColors;
	cssVariables: {
		red: string;
		orange: string;
		yellow: string;
		// Golden Tainoi scale
		gt50: string;
		gt100: string;
		gt200: string;
		gt300: string;
		gt400: string;
		gt500: string;
		gt600: string;
		gt700: string;
		gt800: string;
		gt900: string;
		gt950: string;
	};
}

/**
 * Default Theme Configuration
 *
 * Default theme colors for the application.
 * These can be customized or replaced with organization-specific branding.
 */
export const defaultTheme: ThemeConfig = {
	colors: {
		red: "rgba(218, 55, 50, 1)",
		orange: "rgba(228, 118, 47, 1)",
		yellow: "rgba(247, 190, 51, 1)",
		rose: "rgba(244, 63, 94, 1)",
		blue: "#2563eb",
		blueLight: "#dbeafe",
		// Light versions for backgrounds
		redLight: "rgba(218, 55, 50, 0.15)",
		orangeLight: "rgba(228, 118, 47, 0.15)",
		yellowLight: "rgba(247, 190, 51, 0.15)",
	},
	cssVariables: {
		red: "#e60012",
		orange: "#f97907", // Golden Tainoi 500
		yellow: "#ffd200",
		// Golden Tainoi scale
		gt50: "#fff8eb",
		gt100: "#ffebc6",
		gt200: "#ffca6a",
		gt300: "#ffb94a",
		gt400: "#ff9e20",
		gt500: "#f97907",
		gt600: "#dd5502",
		gt700: "#b73706",
		gt800: "#942a0c",
		gt900: "#7a230d",
		gt950: "#460f02",
	},
};

/**
 * Get theme colors for use in components
 *
 * This function returns the theme colors object that can be used
 * throughout the application. In the future, this could be extended
 * to support dynamic theme switching based on organization branding.
 */
export function getThemeColors(): ThemeColors {
	// For now, return the default theme
	// In the future, this could check user.organization.branding
	// and return organization-specific colors
	return defaultTheme.colors;
}

/**
 * Get CSS variable values for use in CSS files
 */
export function getThemeCSSVariables() {
	return defaultTheme.cssVariables;
}

// Export the default theme colors for convenience
export const themeColors = defaultTheme.colors;
