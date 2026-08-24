import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useAuth } from "~/lib/hooks/use-auth";
import { useNavigate } from "react-router";
import { type CreateUserRequest } from "~/services/user.service";
import { useCreateUser } from "~/lib/hooks/useUsers";
import { useRoles } from "~/lib/hooks/useRoles";
import { ArrowLeft } from "lucide-react";

interface UserFormData {
	email: string;
	userName: string;
	password: string;
	status: "active" | "inactive" | "suspended" | "archived";
	roleId: string;
}

export default function AddUser() {
	const navigate = useNavigate();
	const { user } = useAuth();

	// Hook to fetch roles
	const { data: rolesData, isLoading: isLoadingRoles } = useRoles(true);
	const roles = (rolesData as any)?.roles || [];

	// Mutation hook
	const createUserMutation = useCreateUser();

	const { register, handleSubmit, reset, setValue, watch } = useForm<UserFormData>({
		defaultValues: {
			email: "",
			userName: "",
			password: "",
			status: "active",
			roleId: "",
		},
	});

	// Watch form values for controlled components
	const watchedStatus = watch("status");

	// Convert roles to SelectOption format
	const roleOptions: SelectOption[] =
		roles?.map((role: any) => ({
			value: role.id,
			label: role.name,
		})) || [];

	const onSubmit = (data: UserFormData) => {
		// Get organizationId from user object
		const organizationId = user?.organizationId || user?.organization?.id;

		if (!organizationId) {
			toast.error("User organization ID not found");
			return;
		}

		const payload: CreateUserRequest = {
			email: data.email,
			userName: data.userName,
			password: data.password,
			status: data.status,
			roleId: data.roleId,
			organizationId: organizationId,
		};

		createUserMutation.mutate(payload, {
			onSuccess: () => {
				toast.success("User created successfully");
				reset();
				navigate("/hr/employees");
			},
			onError: (error: any) => {
				toast.error(error?.message || "Failed to create user");
			},
		});
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center gap-4">
				<Button
					variant="outline"
					size="sm"
					onClick={() => navigate("/hr/employees")}
					className="flex items-center gap-2">
					<ArrowLeft className="w-4 h-4" />
					Back
				</Button>
				<div>
					<h1 className="text-2xl font-semibold text-neutral-900">Add User</h1>
					<p className="text-neutral-600">Create a new user account</p>
				</div>
			</div>

			{/* Form Card */}
			<Card>
				<CardHeader>
					<CardTitle>User Information</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
						{/* Email */}
						<div>
							<label
								htmlFor="email"
								className="block text-sm font-medium text-gray-700 mb-2">
								Email <span className="text-red-500">*</span>
							</label>
							<Input
								id="email"
								type="email"
								{...register("email", {
									required: "Email is required",
									pattern: {
										value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
										message: "Invalid email address",
									},
								})}
								placeholder="user@example.com"
							/>
						</div>

						{/* Username */}
						<div>
							<label
								htmlFor="userName"
								className="block text-sm font-medium text-gray-700 mb-2">
								Username <span className="text-red-500">*</span>
							</label>
							<Input
								id="userName"
								{...register("userName", {
									required: "Username is required",
									minLength: {
										value: 3,
										message: "Username must be at least 3 characters",
									},
								})}
								placeholder="username"
							/>
						</div>

						{/* Password */}
						<div>
							<label
								htmlFor="password"
								className="block text-sm font-medium text-gray-700 mb-2">
								Password <span className="text-red-500">*</span>
							</label>
							<Input
								id="password"
								type="password"
								{...register("password", {
									required: "Password is required",
									minLength: {
										value: 8,
										message: "Password must be at least 8 characters",
									},
								})}
								placeholder="Enter password"
							/>
						</div>

						{/* Role */}
						<div>
							<label
								htmlFor="roleId"
								className="block text-sm font-medium text-gray-700 mb-2">
								Role <span className="text-red-500">*</span>
							</label>
							<Select
								options={roleOptions}
								value={watch("roleId")}
								onChange={(value) => setValue("roleId", value)}
								placeholder="Select a role"
								disabled={isLoadingRoles}
							/>
						</div>

						{/* Status */}
						<div>
							<label
								htmlFor="status"
								className="block text-sm font-medium text-gray-700 mb-2">
								Status <span className="text-red-500">*</span>
							</label>
							<Select
								options={[
									{ value: "active", label: "Active" },
									{ value: "inactive", label: "Inactive" },
									{ value: "suspended", label: "Suspended" },
									{ value: "archived", label: "Archived" },
								]}
								value={watchedStatus}
								onChange={(value) =>
									setValue("status", value as UserFormData["status"])
								}
								placeholder="Select status"
							/>
						</div>

						{/* Submit Button */}
						<div className="flex justify-end gap-3 pt-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => navigate("/hr/employees")}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={createUserMutation.isPending}
								className="bg-orange-600 hover:bg-orange-700 text-white">
								{createUserMutation.isPending ? "Creating..." : "Create User"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
