declare module "digest-fetch" {
	interface DigestClientOptions {
		algorithm?: "MD5" | "SHA256";
		statusCode?: number;
		cnonceSize?: number;
		agent?: any;
	}

	class DigestClient {
		constructor(username: string, password: string, options?: DigestClientOptions);
		fetch(url: string, options?: RequestInit): Promise<Response>;
	}

	export default DigestClient;
}

