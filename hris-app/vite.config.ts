import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

const assetNamespace = process.env.VITE_ASSET_NAMESPACE?.trim();
const assetNamePattern = assetNamespace
	? `assets/${assetNamespace}/[name]-[hash][extname]`
	: "assets/[name]-[hash][extname]";
const chunkNamePattern = assetNamespace
	? `assets/${assetNamespace}/[name]-[hash].js`
	: "assets/[name]-[hash].js";

const getDevApiProxyTarget = (mode: string) => {
	const env = loadEnv(mode, __dirname, "");
	const configuredBase = env.VITE_API_BASE_URL?.trim();
	if (!configuredBase) return undefined;

	try {
		const url = new URL(configuredBase);
		url.pathname = "";
		url.search = "";
		url.hash = "";
		return url.toString().replace(/\/$/, "");
	} catch {
		return undefined;
	}
};

export default defineConfig(({ mode }) => {
	const devApiProxyTarget = getDevApiProxyTarget(mode);

	return {
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
			allowedHosts: ["127.0.0.1", "localhost", ".trycloudflare.com"],
			hmr: {
				overlay: false, // Disable error overlay to reduce network requests
			},

			watch: {
				ignored: ["**/node_modules/**", "**/.git/**"],
			},
			proxy: devApiProxyTarget
				? {
						"/api": {
							target: devApiProxyTarget,
							changeOrigin: true,
						},
					}
				: undefined,
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
	};
});
