import React, { useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Badge } from "~/components/atoms/Badge";
import { PlusCircle, Trash2 } from "lucide-react";

interface DeviceEnrollmentRow {
	id: string;
	email: string;
	deviceId: string;
	deviceUserId: string;
	isValid: boolean;
	errors: string[];
}

interface DeviceEnrollmentPreviewTableProps {
	data: Array<{ EMAIL: string; DEVICE_ID: string; DEVICE_USER_ID: string }>;
	users: Array<{ id: string; email: string; firstName?: string; lastName?: string }>;
	devices?: Array<{ id: string; deviceId: string }>;
	deviceUsers?: Array<{ employeeNo: string; name: string }>;
	onChange: (
		updatedData: Array<{ EMAIL: string; DEVICE_ID: string; DEVICE_USER_ID: string }>,
	) => void;
}

export const DeviceEnrollmentPreviewTable: React.FC<DeviceEnrollmentPreviewTableProps> = ({
	data,
	users,
	devices = [],
	deviceUsers = [],
	onChange,
}) => {
	// Convert data to rows with validation
	const [rows, setRows] = useState<DeviceEnrollmentRow[]>(() => {
		return data.map((item, index) => {
			const { isValid, errors } = validateRow(item);
			return {
				id: `row-${index}`,
				email: item.EMAIL || "",
				deviceId: item.DEVICE_ID || "",
				deviceUserId: item.DEVICE_USER_ID || "",
				isValid,
				errors,
			};
		});
	});

	// Validation function
	function validateRow(row: { EMAIL?: string; DEVICE_ID?: string; DEVICE_USER_ID?: string }) {
		const errors: string[] = [];

		if (!row.EMAIL || row.EMAIL.trim() === "") {
			errors.push("Email is required");
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.EMAIL)) {
			errors.push("Invalid email format");
		}

		if (!row.DEVICE_ID || row.DEVICE_ID.trim() === "") {
			errors.push("Device ID is required");
		}

		if (!row.DEVICE_USER_ID || row.DEVICE_USER_ID.trim() === "") {
			errors.push("Device User ID is required");
		}

		return {
			isValid: errors.length === 0,
			errors,
		};
	}

	// Create empty row
	const createEmptyRow = (): DeviceEnrollmentRow => {
		return {
			id: `row-${Date.now()}-${Math.random()}`,
			email: "",
			deviceId: "",
			deviceUserId: "",
			isValid: false,
			errors: ["Email is required", "Device ID is required", "Device User ID is required"],
		};
	};

	// Handle row changes
	const handleRowChange = (
		rowId: string,
		field: keyof Omit<DeviceEnrollmentRow, "id" | "isValid" | "errors">,
		value: string,
	) => {
		const updatedRows = rows.map((row) => {
			if (row.id === rowId) {
				const updatedRow = { ...row, [field]: value };
				const { isValid, errors } = validateRow({
					EMAIL: updatedRow.email,
					DEVICE_ID: updatedRow.deviceId,
					DEVICE_USER_ID: updatedRow.deviceUserId,
				});
				return { ...updatedRow, isValid, errors };
			}
			return row;
		});

		setRows(updatedRows);
		notifyParent(updatedRows);
	};

	// Add new row
	const handleAddRow = () => {
		const newRow = createEmptyRow();
		const updatedRows = [...rows, newRow];
		setRows(updatedRows);
		notifyParent(updatedRows);
	};

	// Delete row
	const handleDeleteRow = (rowId: string) => {
		const updatedRows = rows.filter((row) => row.id !== rowId);
		setRows(updatedRows);
		notifyParent(updatedRows);
	};

	// Notify parent component of changes
	const notifyParent = (updatedRows: DeviceEnrollmentRow[]) => {
		const mappedData = updatedRows.map((row) => ({
			EMAIL: row.email,
			DEVICE_ID: row.deviceId,
			DEVICE_USER_ID: row.deviceUserId,
		}));
		onChange(mappedData);
	};

	// Calculate stats
	const validCount = rows.filter((row) => row.isValid).length;
	const invalidCount = rows.filter((row) => !row.isValid).length;
	const totalCount = rows.length;

	return (
		<div className="space-y-4">
			{/* Stats Bar */}
			<div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
				<div className="flex items-center gap-6">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
							Total:
						</span>
						<Badge variant="outline" className="font-semibold">
							{totalCount}
						</Badge>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
							Valid:
						</span>
						<Badge variant="default" className="bg-green-500 hover:bg-green-600">
							{validCount}
						</Badge>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
							Invalid:
						</span>
						<Badge variant="destructive">{invalidCount}</Badge>
					</div>
				</div>
				<Button onClick={handleAddRow} size="sm" className="gap-2">
					<PlusCircle className="h-4 w-4" />
					Add Row
				</Button>
			</div>

			{/* Table */}
			<div className="border rounded-lg overflow-hidden">
				<div className="overflow-x-auto max-h-[500px] overflow-y-auto">
					<table className="w-full border-collapse">
						<thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
							<tr>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b">
									#
								</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b">
									Email
								</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b">
									Device ID
								</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b">
									Device User ID
								</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b">
									Status
								</th>
								<th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b">
									Actions
								</th>
							</tr>
						</thead>
						<tbody className="bg-white dark:bg-gray-950 divide-y divide-gray-200 dark:divide-gray-800">
							{rows.map((row, index) => (
								<tr
									key={row.id}
									className={`hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors ${
										!row.isValid ? "bg-red-50/50 dark:bg-red-950/10" : ""
									}`}>
									<td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
										{index + 1}
									</td>

									{/* Email - Dropdown */}
									<td className="px-4 py-3">
										<Select
											value={row.email}
											onValueChange={(value) =>
												handleRowChange(row.id, "email", value)
											}>
											<SelectTrigger
												className={`w-full ${!row.email ? "border-red-300" : ""}`}>
												<SelectValue placeholder="Select email..." />
											</SelectTrigger>
											<SelectContent>
												{users.map((user) => (
													<SelectItem key={user.id} value={user.email}>
														{user.email}
														{(user.firstName || user.lastName) && (
															<span className="text-xs text-gray-500 ml-2">
																({user.firstName} {user.lastName})
															</span>
														)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</td>

									{/* Device ID - Dropdown */}
									<td className="px-4 py-3">
										<Select
											value={row.deviceId}
											onValueChange={(value) =>
												handleRowChange(row.id, "deviceId", value)
											}>
											<SelectTrigger
												className={`w-full ${!row.deviceId ? "border-red-300" : ""}`}>
												<SelectValue placeholder="Select device..." />
											</SelectTrigger>
											<SelectContent>
												{devices?.map((device: any) => (
													<SelectItem key={device.id} value={device.id}>
														{device.name ||
															device.deviceId ||
															device.id}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</td>

									{/* Device User ID - Dropdown */}
									<td className="px-4 py-3">
										<Select
											value={row.deviceUserId}
											onValueChange={(value) =>
												handleRowChange(row.id, "deviceUserId", value)
											}>
											<SelectTrigger
												className={`w-full ${!row.deviceUserId ? "border-red-300" : ""}`}>
												<SelectValue placeholder="Select device user..." />
											</SelectTrigger>
											<SelectContent>
												{deviceUsers && deviceUsers.length > 0 ? (
													deviceUsers.map((user: any) => (
														<SelectItem
															key={user.employeeNo}
															value={user.employeeNo}>
															{user.name || user.employeeNo}
														</SelectItem>
													))
												) : (
													<div className="p-2 text-xs text-gray-500 text-center">
														No device users available
													</div>
												)}
											</SelectContent>
										</Select>
									</td>

									{/* Status */}
									<td className="px-4 py-3">
										{row.isValid ? (
											<Badge
												variant="default"
												className="bg-green-500 hover:bg-green-600">
												Valid
											</Badge>
										) : (
											<div className="flex flex-col gap-1">
												<Badge variant="destructive">Invalid</Badge>
												{row.errors.map((error, idx) => (
													<span
														key={idx}
														className="text-xs text-red-600 dark:text-red-400">
														{error}
													</span>
												))}
											</div>
										)}
									</td>

									{/* Actions */}
									<td className="px-4 py-3 text-center">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => handleDeleteRow(row.id)}
											className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20">
											<Trash2 className="h-4 w-4" />
										</Button>
									</td>
								</tr>
							))}

							{rows.length === 0 && (
								<tr>
									<td
										colSpan={6}
										className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
										No enrollment data. Click "Add Row" to add entries.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{/* Invalid Rows Warning */}
			{invalidCount > 0 && (
				<div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
					<p className="text-sm text-yellow-800 dark:text-yellow-200">
						⚠️ {invalidCount} row{invalidCount > 1 ? "s have" : " has"} validation
						errors. Please fix them before importing.
					</p>
				</div>
			)}
		</div>
	);
};
