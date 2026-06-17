import { useState } from "react";
import { useAuth } from "~/lib/hooks/use-auth";

export default function LoginDebug() {
	const [debugInfo, setDebugInfo] = useState<any>(null);
	const { login } = useAuth();

	const testLogin = async () => {
		try {
			console.log("Testing login with debug info...");
			const result = await login("admin-bandai@gmail.com", "password123");
			console.log("Login result:", result);
			setDebugInfo(result);
		} catch (error) {
			console.error("Login error:", error);
			setDebugInfo({ error: error.message });
		}
	};

	return (
		<div className="p-4 border rounded-lg bg-gray-50">
			<h3 className="text-lg font-semibold mb-4">Login Debug</h3>
			<button
				onClick={testLogin}
				className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
				Test Login
			</button>

			{debugInfo && (
				<div className="mt-4">
					<h4 className="font-medium mb-2">Debug Info:</h4>
					<pre className="bg-white p-2 rounded border text-xs overflow-auto">
						{JSON.stringify(debugInfo, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}
