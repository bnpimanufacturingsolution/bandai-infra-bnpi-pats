import { CheckCircle2, User, Building, Briefcase, Clock } from "lucide-react";
import { Card, CardContent } from "~/components/atoms/Card";
import { Badge } from "~/components/atoms/Badge";
import type { RecognitionResult } from "~/services/facial-recognition.service";

interface UserDataDisplayProps {
	recognitionResult: RecognitionResult;
	onLogTime?: () => void;
	isLoading?: boolean;
}

export default function UserDataDisplay({
	recognitionResult,
	onLogTime,
	isLoading = false,
}: UserDataDisplayProps) {
	if (!recognitionResult.user) {
		return (
			<Card className="border-2 border-yellow-200 bg-yellow-50">
				<CardContent className="p-6">
					<div className="flex items-center justify-center space-x-3">
						<User className="h-8 w-8 text-yellow-600" />
						<div className="text-center">
							<h3 className="text-lg font-semibold text-yellow-800">Face Detected</h3>
							<p className="text-sm text-yellow-700">
								Unknown person - please register
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	}

	const { user, confidence } = recognitionResult;
	const confidencePercentage = Math.round(confidence * 100);

	return (
		<Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 shadow-lg">
			<CardContent className="p-6">
				<div className="space-y-4">
					{/* Header with avatar and name */}
					<div className="flex items-center space-x-4">
						<div className="relative">
							<div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
								{user.avatar || user.name.charAt(0)}
							</div>
							<div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
								<CheckCircle2 className="w-4 h-4 text-white" />
							</div>
						</div>
						<div className="flex-1">
							<h3 className="text-xl font-bold text-gray-900">{user.name}</h3>
							<div className="flex items-center space-x-2 mt-1">
								<Badge
									variant="secondary"
									className="bg-green-100 text-green-800 border-green-200">
									{confidencePercentage}% Match
								</Badge>
							</div>
						</div>
					</div>

					{/* User details */}
					<div className="space-y-3">
						<div className="flex items-center space-x-3 text-gray-700">
							<Building className="h-5 w-5 text-gray-500" />
							<div>
								<span className="text-sm font-medium">Department:</span>
								<span className="ml-2 text-sm">{user.department}</span>
							</div>
						</div>

						<div className="flex items-center space-x-3 text-gray-700">
							<Briefcase className="h-5 w-5 text-gray-500" />
							<div>
								<span className="text-sm font-medium">Position:</span>
								<span className="ml-2 text-sm">{user.position}</span>
							</div>
						</div>

						<div className="flex items-center space-x-3 text-gray-700">
							<Clock className="h-5 w-5 text-gray-500" />
							<div>
								<span className="text-sm font-medium">Status:</span>
								<span className="ml-2 text-sm">Ready to log time</span>
							</div>
						</div>
					</div>

					{/* Action button */}
					{onLogTime && (
						<div className="pt-4 border-t border-green-200">
							<button
								onClick={onLogTime}
								disabled={isLoading}
								className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center space-x-2">
								{isLoading ? (
									<>
										<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
										<span>Processing...</span>
									</>
								) : (
									<>
										<Clock className="w-4 h-4" />
										<span>Log Time</span>
									</>
								)}
							</button>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
