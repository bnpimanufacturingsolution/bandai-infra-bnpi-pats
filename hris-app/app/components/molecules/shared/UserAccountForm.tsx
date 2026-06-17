import React from "react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Card, CardContent } from "~/components/atoms/Card";
import { useRoles } from "~/lib/hooks/useRoles";
import { RefreshCw } from "lucide-react";
import type { SectionStatus } from "~/components/templates/add-employee-template";

interface UserAccountFormProps {
	form: any;
	onComplete: () => void;
	status: SectionStatus;
}

export function UserAccountForm({ form, onComplete, status }: UserAccountFormProps) {
	// Fetch roles from API
	const {
		data: rolesData,
		isLoading: rolesLoading,
		error: rolesError,
		refetch: refetchRoles,
	} = useRoles(true);
	const {
		register,
		formState: { errors },
		trigger,
	} = form;

	// Process roles data for dropdown
	const roles = React.useMemo(() => {
		if (!rolesData?.data?.roles) return [];
		return rolesData.data.roles.map((role) => ({
			value: role.id,
			label: role.name,
		}));
	}, [rolesData]);

	const isCompleted = status === "completed";

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const isValid = await trigger("user");
		if (isValid) {
			onComplete();
		}
	};

	return (
		<Card className="border border-gray-200 bg-white">
			<CardContent className="p-6">
				<div className="space-y-6">
					<div>
						<h2 className="text-xl font-semibold text-gray-900">User Account</h2>
						<p className="text-sm text-gray-600 mt-1">
							Create login credentials and access settings for the new employee
						</p>
					</div>

					<form onSubmit={handleSubmit} className="space-y-4">
						<div>
							<label
								htmlFor="user.email"
								className="block text-sm font-medium text-gray-700 mb-1">
								Email Address
							</label>
							<Input
								id="user.email"
								type="email"
								placeholder="bryan@gmail.com"
								className={
									errors.user?.email ? "border-red-300 focus:border-red-500" : ""
								}
								disabled={isCompleted}
								{...register("user.email", {
									required: "Email is required",
									pattern: {
										value: /\S+@\S+\.\S+/,
										message: "Email is invalid",
									},
								})}
							/>
							{errors.user?.email && (
								<p className="mt-1 text-sm text-red-600">
									{errors.user.email.message}
								</p>
							)}
						</div>

						<div>
							<label
								htmlFor="user.userName"
								className="block text-sm font-medium text-gray-700 mb-1">
								Username
							</label>
							<Input
								id="user.userName"
								type="text"
								placeholder="bryan-bandai"
								className={
									errors.user?.userName
										? "border-red-300 focus:border-red-500"
										: ""
								}
								disabled={isCompleted}
								{...register("user.userName", {
									required: "Username is required",
									minLength: {
										value: 3,
										message: "Username must be at least 3 characters",
									},
								})}
							/>
							{errors.user?.userName && (
								<p className="mt-1 text-sm text-red-600">
									{errors.user.userName.message}
								</p>
							)}
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label
									htmlFor="user.roleId"
									className="block text-sm font-medium text-gray-700 mb-1">
									Role *
								</label>
								<div className="relative">
									<select
										id="user.roleId"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.user?.roleId
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										} ${isCompleted ? "bg-gray-100" : ""} ${
											rolesLoading ? "opacity-50" : ""
										}`}
										disabled={isCompleted || rolesLoading}
										{...register("user.roleId", {
											required: "Role is required",
										})}>
										<option value="">
											{rolesLoading ? "Loading roles..." : "Select Role"}
										</option>
										{roles.map((role) => (
											<option key={role.value} value={role.value}>
												{role.label}
											</option>
										))}
									</select>
									{rolesLoading && (
										<div className="absolute right-3 top-1/2 transform -translate-y-1/2">
											<RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
										</div>
									)}
								</div>
								{rolesError && (
									<div className="mt-1 flex items-center gap-2">
										<p className="text-sm text-red-600">
											Failed to load roles: {rolesError.message}
										</p>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => refetchRoles()}
											className="text-xs">
											<RefreshCw className="h-3 w-3 mr-1" />
											Retry
										</Button>
									</div>
								)}
								{errors.user?.roleId && (
									<p className="mt-1 text-sm text-red-600">
										{errors.user.roleId.message}
									</p>
								)}
							</div>

							<div>
								<label
									htmlFor="user.status"
									className="block text-sm font-medium text-gray-700 mb-1">
									Status
								</label>
								<select
									id="user.status"
									className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
										errors.user?.status
											? "border-red-300 focus:border-red-500"
											: "border-gray-300"
									} ${isCompleted ? "bg-gray-100" : ""}`}
									disabled={isCompleted}
									{...register("user.status", {
										required: "Status is required",
									})}>
									<option value="">Select Status</option>
									<option value="active">Active</option>
									<option value="inactive">Inactive</option>
								</select>
								{errors.user?.status && (
									<p className="mt-1 text-sm text-red-600">
										{errors.user.status.message}
									</p>
								)}
							</div>
						</div>

						<div>
							<label
								htmlFor="user.avatar"
								className="block text-sm font-medium text-gray-700 mb-1">
								Avatar URL
							</label>
							<Input
								id="user.avatar"
								type="url"
								placeholder="https://example.com/avatar.jpg"
								className={
									errors.user?.avatar ? "border-red-300 focus:border-red-500" : ""
								}
								disabled={isCompleted}
								{...register("user.avatar")}
							/>
							<p className="mt-1 text-sm text-gray-500">
								Optional: URL to employee&apos;s avatar image
							</p>
							{errors.user?.avatar && (
								<p className="mt-1 text-sm text-red-600">
									{errors.user.avatar.message}
								</p>
							)}
						</div>

						<div>
							<label
								htmlFor="user.password"
								className="block text-sm font-medium text-gray-700 mb-1">
								Temporary Password
							</label>
							<Input
								id="user.password"
								type="password"
								placeholder="Enter temporary password"
								className={
									errors.user?.password
										? "border-red-300 focus:border-red-500"
										: ""
								}
								disabled={isCompleted}
								{...register("user.password", {
									required: "Password is required",
									minLength: {
										value: 8,
										message: "Password must be at least 8 characters",
									},
								})}
							/>
							<p className="mt-1 text-sm text-gray-500">
								Employee will be prompted to change on first login
							</p>
							{errors.user?.password && (
								<p className="mt-1 text-sm text-red-600">
									{errors.user.password.message}
								</p>
							)}
						</div>

						<div>
							<label
								htmlFor="user.loginMethod"
								className="block text-sm font-medium text-gray-700 mb-1">
								Login Method
							</label>
							<select
								id="user.loginMethod"
								className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
									errors.user?.loginMethod
										? "border-red-300 focus:border-red-500"
										: "border-gray-300"
								} ${isCompleted ? "bg-gray-100" : ""}`}
								disabled={isCompleted}
								{...register("user.loginMethod", {
									required: "Login method is required",
								})}>
								<option value="">Select Login Method</option>
								<option value="email">Email</option>
								<option value="username">Username</option>
							</select>
							{errors.user?.loginMethod && (
								<p className="mt-1 text-sm text-red-600">
									{errors.user.loginMethod.message}
								</p>
							)}
						</div>

						{!isCompleted && (
							<div className="pt-4">
								<Button
									type="submit"
									className="bg-orange-600 hover:bg-orange-700 text-white">
									Save & Continue
								</Button>
							</div>
						)}

						{isCompleted && (
							<div className="pt-4">
								<div className="flex items-center gap-2 text-green-600">
									<svg
										className="h-4 w-4"
										fill="currentColor"
										viewBox="0 0 20 20">
										<path
											fillRule="evenodd"
											d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
											clipRule="evenodd"
										/>
									</svg>
									<span className="text-sm font-medium">
										User account created successfully
									</span>
								</div>
							</div>
						)}
					</form>
				</div>
			</CardContent>
		</Card>
	);
}
