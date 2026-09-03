import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [tailwindcss(), reactRouter()],
	resolve: {
		alias: {
			"~": resolve(projectRoot, "./app"),
			"@": resolve(projectRoot, "./app"),
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
