import { describe, expect, it } from "vitest";
import {
	bandaiEuropeB2BThemeTokens,
	defaultTheme,
	getBandaiEuropeB2BThemeTokens,
	getThemeCSSVariables,
	getThemeColors,
	themeColors,
} from "./theme";

describe("theme configuration", () => {
	it("keeps the existing legacy runtime palette stable for untouched surfaces", () => {
		expect(getThemeColors()).toBe(defaultTheme.colors);
		expect(themeColors.red).toBe("rgba(218, 55, 50, 1)");
		expect(themeColors.orange).toBe("rgba(228, 118, 47, 1)");
		expect(themeColors.yellow).toBe("rgba(247, 190, 51, 1)");
	});

	it("updates exported css variables to the phase 1 brand foundation values", () => {
		expect(getThemeCSSVariables()).toEqual({
			red: "rgb(226, 6, 19)",
			orange: "rgb(255, 173, 0)",
			yellow: "#ffd200",
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
		});
	});

	it("exports the Bandai Europe B2B foundation tokens for future token-first work", () => {
		expect(getBandaiEuropeB2BThemeTokens()).toBe(bandaiEuropeB2BThemeTokens);
		expect(bandaiEuropeB2BThemeTokens).toEqual({
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
		});
	});
});
