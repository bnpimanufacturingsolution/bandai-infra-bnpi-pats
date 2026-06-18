import bandaiLogo from "~/assets/bandai_logo.png";

const LEGACY_BANDAI_LOGO_VALUES = new Set([
	"assets/images/bandai_logo.png",
	"/assets/images/bandai_logo.png",
	"app/assets/bandai_logo.png",
	"/app/assets/bandai_logo.png",
	"~/assets/bandai_logo.png",
]);

export function resolveCompanyLogo(value?: string | null) {
	const logo = String(value || "").trim();
	if (!logo || LEGACY_BANDAI_LOGO_VALUES.has(logo)) {
		return bandaiLogo;
	}
	return logo;
}

export { bandaiLogo };
