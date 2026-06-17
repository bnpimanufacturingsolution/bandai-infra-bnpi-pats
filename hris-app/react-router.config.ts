import type { Config } from "@react-router/dev/config";

export default {
	// Config options...
	// Server-side render by default, to enable SPA mode set this to `false`
	ssr: false,
	// Disable route manifest to reduce network requests
	future: {
		v3_fetcherPersist: false,
		v3_relativeSplatPath: false,
		v3_throwAbortReason: false,
	},
} satisfies Config;
