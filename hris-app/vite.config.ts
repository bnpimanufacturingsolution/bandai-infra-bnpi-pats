import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

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
				manualChunks: undefined,
			},
		},
	},
});
