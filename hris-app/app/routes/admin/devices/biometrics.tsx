import { Fingerprint } from "lucide-react";

export default function BiometricsPage() {
	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
						<Fingerprint className="w-8 h-8 text-blue-600" />
						Biometrics Configuration
					</h1>
					<p className="mt-2 text-gray-600">
						Manage biometric devices and configurations
					</p>
				</div>
			</div>

			{/* Main Content */}
			<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
				<div className="flex flex-col items-center justify-center py-12">
					<Fingerprint className="w-16 h-16 text-gray-300 mb-4" />
					<p className="text-lg text-gray-600">Bio text</p>
				</div>
			</div>
		</div>
	);
}
