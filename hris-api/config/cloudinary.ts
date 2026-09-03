import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import path from "path";

const apiRoot = path.resolve(__dirname, "..");

for (const envFile of [".env", ".env.dev", ".env.uat"]) {
	dotenv.config({ path: path.join(apiRoot, envFile) });
}

function getEnvValue(key: string): string {
	const value = process.env[key]?.trim() || "";
	return value === "undefined" || value === "null" ? "" : value;
}

const cloudName = getEnvValue("CLOUDINARY_CLOUD_NAME");
const apiKey = getEnvValue("CLOUDINARY_API_KEY");
const apiSecret = getEnvValue("CLOUDINARY_API_SECRET");

// Configure Cloudinary with environment variables
cloudinary.config({
	cloud_name: cloudName,
	api_key: apiKey,
	api_secret: apiSecret,
});

export { cloudinary };

export const cloudinaryConfig = {
	cloudName,
	apiKey,
	apiSecret,
	isConfigured(): boolean {
		return !!(this.cloudName && this.apiKey && this.apiSecret);
	},
};
