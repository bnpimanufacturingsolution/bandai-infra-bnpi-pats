import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

const assetNamespace = process.env.VITE_ASSET_NAMESPACE?.trim();
const assetNamePattern = assetNamespace
	? `assets/${assetNamespace}/[name]-[hash][extname]`
	: "assets/[name]-[hash][extname]";
const chunkNamePattern = assetNamespace
	? `assets/${assetNamespace}/[name]-[hash].js`
	: "assets/[name]-[hash].js";

export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./app"),
		},
	},
	optimizeDeps: {
		include: ["lucide-react"],
	},
	server: {
		port: 5175,
		hmr: {
			overlay: false, // Disable error overlay to reduce network requests
		},

		watch: {
			ignored: ["**/node_modules/**", "**/.git/**"],
		},
	},
	build: {
		rollupOptions: {
			output: {
				assetFileNames: assetNamePattern,
				chunkFileNames: chunkNamePattern,
				entryFileNames: chunkNamePattern,
				manualChunks: undefined,
			},
		},
	},
});
