import { useState } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff, Fingerprint, User, Lock } from "lucide-react";

export default function SiteLogin() {
	const navigate = useNavigate();
	const [employeeId, setEmployeeId] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);

	const handleContinue = (e: React.FormEvent) => {
		e.preventDefault();
		navigate("/site");
	};

	return (
		<div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
			{/* Main Content */}
			<div className="flex-1 bg-white px-6 py-12 flex flex-col">
				{/* Logo */}
				<div className="flex justify-center mb-8">
					<div className="w-24 h-24 bg-gradient-to-br from-[#ff9e20] to-[#dd5502] rounded-full flex items-center justify-center">
						<div className="w-16 h-16 bg-white rounded-full"></div>
					</div>
				</div>

				{/* Title */}
				<div className="text-center mb-2">
					<h1 className="text-2xl font-bold text-gray-900">Nice to see you!</h1>
				</div>
				<div className="text-center mb-12">
					<p className="text-sm text-gray-500">Enter Employee ID to log time</p>
				</div>

				{/* Form */}
				<form onSubmit={handleContinue} className="space-y-4 mb-12">
					{/* Employee ID Input */}
					<div className="relative">
						<div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
							<User className="w-5 h-5" />
						</div>
						<input
							type="text"
							value={employeeId}
							onChange={(e) => setEmployeeId(e.target.value)}
							placeholder="Enter your employee ID"
							className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97907] focus:border-transparent"
						/>
					</div>

					{/* Password Input */}
					<div className="relative">
						<div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
							<Lock className="w-5 h-5" />
						</div>
						<input
							type={showPassword ? "text" : "password"}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Enter your password"
							className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97907] focus:border-transparent"
						/>
						<button
							type="button"
							onClick={() => setShowPassword(!showPassword)}
							className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
							{showPassword ? (
								<EyeOff className="w-5 h-5" />
							) : (
								<Eye className="w-5 h-5" />
							)}
						</button>
					</div>

					{/* Continue Button */}
					<button
						type="submit"
						className="w-full bg-[#f97907] text-white py-3 rounded-lg font-medium hover:bg-[#dd5502] transition-colors">
						Continue
					</button>
				</form>

				{/* Fingerprint */}
				<div className="flex-1 flex items-end justify-center pb-12">
					<Fingerprint className="w-16 h-16 text-gray-400" />
				</div>
			</div>
		</div>
	);
}
