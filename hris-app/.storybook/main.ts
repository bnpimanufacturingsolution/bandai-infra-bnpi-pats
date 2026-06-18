import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

const config: StorybookConfig = {
	stories: ["../app/**/*.stories.@(ts|tsx)"],
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	core: {
		builder: {
			name: "@storybook/builder-vite",
			options: {
				viteConfigPath: "storybook.vite.config.ts",
			},
		},
	},
	viteFinal: async (config) => {
		config.plugins = [...(config.plugins || []), tailwindcss(), tsconfigPaths()];
		return config;
	},
};

export default config;
