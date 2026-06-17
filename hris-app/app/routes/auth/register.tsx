import { useState } from "react";
import { Link } from "react-router";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Mail, Lock, Eye, EyeOff, User, HelpCircle, Flag } from "lucide-react";

export default function RegisterPage() {
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [formData, setFormData] = useState({
		firstName: "",
		lastName: "",
		email: "",
		password: "",
		confirmPassword: "",
	});
	const [agreeToTerms, setAgreeToTerms] = useState(false);

	const handleInputChange = (field: string, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
	};

	return (
		<div className="h-screen w-full bg-gray-50 flex">
			{/* Left Column - Register Form */}
			<div className="flex-1 flex flex-col justify-between px-8 py-8">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
							<span className="text-white font-bold text-lg">U</span>
						</div>
						<span className="text-xl font-bold text-gray-900">UZARO HR</span>
					</div>
					<div className="flex items-center gap-4">
						<HelpCircle className="w-5 h-5 text-gray-400" />
						<span className="text-gray-600">Already have an account?</span>
						<Link to="/auth/login">
							<Button variant="outline" size="sm">
								Sign In
							</Button>
						</Link>
					</div>
				</div>

				{/* Register Form */}
				<div className="flex-1 flex items-center justify-center">
					<div className="max-w-md w-full">
						<Card className="border-0 shadow-none">
							<CardHeader className="text-center pb-6">
								<CardTitle className="text-2xl font-bold text-gray-900">
									Create Account
								</CardTitle>
								<CardDescription className="text-gray-600">
									Fill in your details to get started with UZARO HR
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-6">
								{/* Name Fields */}
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<label className="text-sm font-medium text-gray-700">
											First Name *
										</label>
										<div className="relative">
											<User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
											<Input
												type="text"
												value={formData.firstName}
												onChange={(e) =>
													handleInputChange("firstName", e.target.value)
												}
												className="pl-10 h-12"
												placeholder="First name"
											/>
										</div>
									</div>
									<div className="space-y-2">
										<label className="text-sm font-medium text-gray-700">
											Last Name *
										</label>
										<div className="relative">
											<User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
											<Input
												type="text"
												value={formData.lastName}
												onChange={(e) =>
													handleInputChange("lastName", e.target.value)
												}
												className="pl-10 h-12"
												placeholder="Last name"
											/>
										</div>
									</div>
								</div>

								{/* Email Input */}
								<div className="space-y-2">
									<label className="text-sm font-medium text-gray-700">
										Email Address *
									</label>
									<div className="relative">
										<Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
										<Input
											type="email"
											value={formData.email}
											onChange={(e) =>
												handleInputChange("email", e.target.value)
											}
											className="pl-10 h-12"
											placeholder="Enter your email address"
										/>
									</div>
								</div>

								{/* Password Input */}
								<div className="space-y-2">
									<label className="text-sm font-medium text-gray-700">
										Password *
									</label>
									<div className="relative">
										<Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
										<Input
											type={showPassword ? "text" : "password"}
											value={formData.password}
											onChange={(e) =>
												handleInputChange("password", e.target.value)
											}
											className="pl-10 pr-10 h-12"
											placeholder="Create a password"
										/>
										<button
											type="button"
											onClick={() => setShowPassword(!showPassword)}
											className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
											{showPassword ? (
												<EyeOff className="w-4 h-4" />
											) : (
												<Eye className="w-4 h-4" />
											)}
										</button>
									</div>
								</div>

								{/* Confirm Password Input */}
								<div className="space-y-2">
									<label className="text-sm font-medium text-gray-700">
										Confirm Password *
									</label>
									<div className="relative">
										<Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
										<Input
											type={showConfirmPassword ? "text" : "password"}
											value={formData.confirmPassword}
											onChange={(e) =>
												handleInputChange("confirmPassword", e.target.value)
											}
											className="pl-10 pr-10 h-12"
											placeholder="Confirm your password"
										/>
										<button
											type="button"
											onClick={() =>
												setShowConfirmPassword(!showConfirmPassword)
											}
											className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
											{showConfirmPassword ? (
												<EyeOff className="w-4 h-4" />
											) : (
												<Eye className="w-4 h-4" />
											)}
										</button>
									</div>
								</div>

								{/* Terms Agreement */}
								<label className="flex items-start gap-3 cursor-pointer">
									<input
										type="checkbox"
										checked={agreeToTerms}
										onChange={(e) => setAgreeToTerms(e.target.checked)}
										className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-600 mt-0.5"
									/>
									<span className="text-sm text-gray-700">
										I agree to the{" "}
										<Link
											to="/legal/terms"
											className="text-orange-600 hover:underline">
											Terms of Service
										</Link>{" "}
										and{" "}
										<Link
											to="/legal/privacy"
											className="text-orange-600 hover:underline">
											Privacy Policy
										</Link>
									</span>
								</label>

								{/* Register Button */}
								<Button
									className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-medium"
									disabled={!agreeToTerms}>
									Create Account
								</Button>

								{/* Divider */}
								<div className="relative">
									<div className="absolute inset-0 flex items-center">
										<div className="w-full border-t border-gray-200"></div>
									</div>
									<div className="relative flex justify-center text-sm">
										<span className="px-4 bg-gray-50 text-gray-500">OR</span>
									</div>
								</div>

								{/* Social Login Buttons */}
								<div className="grid grid-cols-3 gap-3">
									<Button
										variant="outline"
										className="h-12 flex items-center gap-2">
										<svg className="w-4 h-4" viewBox="0 0 24 24">
											<path
												fill="#4285F4"
												d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
											/>
											<path
												fill="#34A853"
												d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
											/>
											<path
												fill="#FBBC05"
												d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
											/>
											<path
												fill="#EA4335"
												d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
											/>
										</svg>
										<span className="text-xs">Google</span>
									</Button>
									<Button
										variant="outline"
										className="h-12 flex items-center gap-2">
										<svg
											className="w-4 h-4 text-blue-600"
											fill="currentColor"
											viewBox="0 0 24 24">
											<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
										</svg>
										<span className="text-xs">Facebook</span>
									</Button>
									<Button
										variant="outline"
										className="h-12 flex items-center gap-2">
										<svg
											className="w-4 h-4 text-black"
											fill="currentColor"
											viewBox="0 0 24 24">
											<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
										</svg>
										<span className="text-xs">Twitter</span>
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between">
					<span className="text-sm text-gray-500">
						© 2024 UZARO HR. All Rights Reserved.
					</span>
					<div className="flex items-center gap-2">
						<Flag className="w-4 h-4" />
						<span className="text-sm text-gray-600">IN</span>
					</div>
				</div>
			</div>

			{/* Right Column - Dashboard Preview */}
			<div className="flex-1 bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center p-8">
				<div className="max-w-lg w-full">
					{/* Dashboard Preview Card */}
					<Card className="bg-white/95 backdrop-blur-sm border-0 shadow-2xl">
						<CardContent className="p-6">
							{/* Welcome Message */}
							<div className="text-center mb-6">
								<div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-orange-600 to-orange-400 rounded-full flex items-center justify-center">
									<span className="text-white font-bold text-2xl">U</span>
								</div>
								<h3 className="text-xl font-bold text-gray-900 mb-2">
									Welcome to UZARO HR
								</h3>
								<p className="text-gray-600 text-sm">
									Your comprehensive HR management solution
								</p>
							</div>

							{/* Features List */}
							<div className="space-y-3">
								{[
									{
										icon: "👥",
										title: "Employee Management",
										desc: "Manage your team efficiently",
									},
									{
										icon: "📊",
										title: "Analytics Dashboard",
										desc: "Track performance metrics",
									},
									{
										icon: "📅",
										title: "Leave Management",
										desc: "Handle time-off requests",
									},
									{
										icon: "💰",
										title: "Payroll System",
										desc: "Automated salary processing",
									},
								].map((feature, index) => (
									<div
										key={index}
										className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
										<span className="text-2xl">{feature.icon}</span>
										<div>
											<h4 className="font-medium text-gray-900 text-sm">
												{feature.title}
											</h4>
											<p className="text-xs text-gray-600">{feature.desc}</p>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					{/* Promotional Text */}
					<div className="text-center mt-8 text-white">
						<h2 className="text-2xl font-bold mb-3">Join Thousands of Companies</h2>
						<p className="text-white/90 text-lg leading-relaxed">
							Streamline your HR processes and boost productivity with our
							comprehensive management platform.
						</p>
					</div>

					{/* Pagination Dots */}
					<div className="flex justify-center gap-2 mt-6">
						{[1, 2, 3, 4].map((dot) => (
							<div
								key={dot}
								className={`w-2 h-2 rounded-full ${
									dot === 2 ? "bg-white" : "bg-white/30"
								}`}></div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
