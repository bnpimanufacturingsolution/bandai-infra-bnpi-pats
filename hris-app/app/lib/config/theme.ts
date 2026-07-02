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

export interface BrandThemeColors {
	primary: string;
	primaryBorder: string;
	accent: string;
	subheading: string;
	inputBackground: string;
	inputBorder: string;
	selectBorder: string;
	selectText: string;
	textPrimary: string;
	textOnPrimary: string;
}

export interface BrandThemeTypography {
	fontFamilyBase: string;
	fontFamilyHeading: string;
	h1Size: string;
	h1Weight: number;
	h1LetterSpacing: string;
	buttonSize: string;
	buttonPrimaryWeight: number;
	buttonSubmitWeight: number;
	buttonLetterSpacing: string;
	inputSize: string;
	inputWeight: number;
}

export interface BrandThemeGeometry {
	inputRadius: string;
	inputPadding: string;
	inputFieldGap: string;
	selectRadius: string;
	selectPadding: string;
	selectShadow: string;
	buttonPrimaryRadius: string;
	buttonPrimaryPadding: string;
	buttonSubmitRadius: string;
	buttonSubmitPadding: string;
}

export interface BrandThemeTokens {
	colors: BrandThemeColors;
	typography: BrandThemeTypography;
	geometry: BrandThemeGeometry;
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
		red: "rgb(226, 6, 19)",
		orange: "rgb(255, 173, 0)",
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

export const bandaiEuropeB2BThemeTokens: BrandThemeTokens = {
	colors: {
		primary: "rgb(226, 6, 19)",
		primaryBorder: "rgb(226, 6, 19)",
		accent: "rgb(255, 173, 0)",
		subheading: "rgb(30, 36, 77)",
		inputBackground: "rgb(255, 255, 255)",
		inputBorder: "rgb(0, 0, 0)",
		selectBorder: "rgb(204, 204, 204)",
		selectText: "rgb(85, 85, 85)",
		textPrimary: "rgb(0, 0, 0)",
		textOnPrimary: "rgb(255, 255, 255)",
	},
	typography: {
		fontFamilyBase: 'Metropolis, Gotham, "Helvetica Neue", Arial, sans-serif',
		fontFamilyHeading: 'Metropolis, Gotham, "Helvetica Neue", Arial, sans-serif',
		h1Size: "54px",
		h1Weight: 900,
		h1LetterSpacing: "-0.48px",
		buttonSize: "14px",
		buttonPrimaryWeight: 600,
		buttonSubmitWeight: 400,
		buttonLetterSpacing: "1.12px",
		inputSize: "20px",
		inputWeight: 500,
	},
	geometry: {
		inputRadius: "12px",
		inputPadding: "22px 22px 19px",
		inputFieldGap: "30px",
		selectRadius: "4px",
		selectPadding: "6px 28px 6px 12px",
		selectShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.08)",
		buttonPrimaryRadius: "12px",
		buttonPrimaryPadding: "26px 30px 25px",
		buttonSubmitRadius: "3px",
		buttonSubmitPadding: "12px 15px",
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

export function getBandaiEuropeB2BThemeTokens(): BrandThemeTokens {
	return bandaiEuropeB2BThemeTokens;
}

// Export the default theme colors for convenience
export const themeColors = defaultTheme.colors;
