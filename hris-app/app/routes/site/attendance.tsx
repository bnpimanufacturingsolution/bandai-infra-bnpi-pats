import { useState, useRef } from "react";
import { Camera } from "lucide-react";
import MobileSiteLayout from "~/layouts/mobile-site-layout";

export default function SiteAttendance() {
	const [capturedImage, setCapturedImage] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleCapture = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (event) => {
				setCapturedImage(event.target?.result as string);
			};
			reader.readAsDataURL(file);
		}
	};

	const handleSubmit = () => {
		console.log("Submitting attendance...");
	};

	const handleCancel = () => {
		setCapturedImage(null);
	};

	return (
		<MobileSiteLayout>
			<div className="min-h-screen bg-white">
				{/* Main Content */}
				<div className="px-6 py-6">
					{/* Photo Capture Area */}
					<div className="bg-gradient-to-b from-blue-100 to-blue-50 rounded-2xl overflow-hidden mb-6">
						{capturedImage ? (
							<div className="relative">
								<img
									src={capturedImage}
									alt="Captured"
									className="w-full h-96 object-cover"
								/>
								<div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2">
									<p className="text-sm font-medium text-gray-900">Location A</p>
									<p className="text-xs text-gray-600">April 11, 2023</p>
									<p className="text-xs text-gray-600">10:00:05 AM</p>
								</div>
							</div>
						) : (
							<div
								className="h-96 flex items-center justify-center cursor-pointer"
								onClick={handleCapture}>
								<div className="text-center">
									<Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
									<p className="text-sm text-gray-600">Tap to capture photo</p>
								</div>
							</div>
						)}
					</div>

					{/* Hidden File Input */}
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						capture="user"
						onChange={handleFileChange}
						className="hidden"
					/>

					{/* Action Buttons */}
					<div className="flex gap-4">
						<button
							onClick={handleCancel}
							className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors">
							Cancel
						</button>
						<button
							onClick={handleSubmit}
							disabled={!capturedImage}
							className="flex-1 bg-purple-700 text-white py-3 rounded-lg font-medium hover:bg-purple-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed">
							Submit
						</button>
					</div>
				</div>
			</div>
		</MobileSiteLayout>
	);
}
