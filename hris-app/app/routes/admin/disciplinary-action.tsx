import { useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { DataTable, type Column } from "~/components/atoms/DataTable";
import { AlertTriangle, Plus, Eye, Edit, Trash2, MoreVertical } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

interface DisciplinaryRule {
	id: string;
	ruleName: string;
	category: "CONDUCT" | "PERFORMANCE" | "ATTENDANCE" | "SAFETY" | "OTHER";
	severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
	description: string;
	defaultPenalty: string;
	isActive: boolean;
	createdAt?: string;
	updatedAt?: string;
}

interface DisciplinaryRuleFormData {
	ruleName: string;
	category: "CONDUCT" | "PERFORMANCE" | "ATTENDANCE" | "SAFETY" | "OTHER";
	severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
	description: string;
	defaultPenalty: string;
	isActive: boolean;
}

const categoryOptions: SelectOption[] = [
	{ value: "CONDUCT", label: "Conduct" },
	{ value: "PERFORMANCE", label: "Performance" },
	{ value: "ATTENDANCE", label: "Attendance" },
	{ value: "SAFETY", label: "Safety" },
	{ value: "OTHER", label: "Other" },
];

const severityOptions: SelectOption[] = [
	{ value: "LOW", label: "Low" },
	{ value: "MEDIUM", label: "Medium" },
	{ value: "HIGH", label: "High" },
	{ value: "CRITICAL", label: "Critical" },
];

// Mock data - replace with actual API calls
const mockRules: DisciplinaryRule[] = [
	{
		id: "1",
		ruleName: "Tardiness",
		category: "ATTENDANCE",
		severity: "MEDIUM",
		description: "Employee arriving late to work without valid reason",
		defaultPenalty: "Verbal warning",
		isActive: true,
	},
	{
		id: "2",
		ruleName: "Insubordination",
		category: "CONDUCT",
		severity: "HIGH",
		description: "Refusing to follow direct orders from supervisor",
		defaultPenalty: "Written warning",
		isActive: true,
	},
	{
		id: "3",
		ruleName: "Poor Performance",
		category: "PERFORMANCE",
		severity: "MEDIUM",
		description: "Consistently failing to meet performance standards",
		defaultPenalty: "Performance improvement plan",
		isActive: true,
	},
];

export default function DisciplinaryActionPage() {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isViewModalOpen, setIsViewModalOpen] = useState(false);
	const [editing, setEditing] = useState<DisciplinaryRule | null>(null);
	const [viewing, setViewing] = useState<DisciplinaryRule | null>(null);
	const [rules, setRules] = useState<DisciplinaryRule[]>(mockRules);

	const { register, handleSubmit, reset, setValue, watch } = useForm<DisciplinaryRuleFormData>({
		defaultValues: {
			ruleName: "",
			category: "CONDUCT",
			severity: "MEDIUM",
			description: "",
			defaultPenalty: "",
			isActive: true,
		},
	});

	const openCreate = () => {
		setEditing(null);
		reset({
			ruleName: "",
			category: "CONDUCT",
			severity: "MEDIUM",
			description: "",
			defaultPenalty: "",
			isActive: true,
		});
		setIsModalOpen(true);
	};

	const openEdit = (rule: DisciplinaryRule) => {
		setEditing(rule);
		reset({
			ruleName: rule.ruleName,
			category: rule.category,
			severity: rule.severity,
			description: rule.description,
			defaultPenalty: rule.defaultPenalty,
			isActive: rule.isActive,
		});
		setIsModalOpen(true);
	};

	const handleDelete = (rule: DisciplinaryRule) => {
		if (confirm("Are you sure you want to delete this disciplinary rule?")) {
			setRules(rules.filter((r) => r.id !== rule.id));
			toast.success("Disciplinary rule deleted successfully");
		}
	};

	const handleView = (rule: DisciplinaryRule) => {
		setViewing(rule);
		setIsViewModalOpen(true);
	};

	const handleCloseModal = () => {
		setIsModalOpen(false);
		setEditing(null);
		reset();
	};

	const onSubmit = (data: DisciplinaryRuleFormData) => {
		if (editing) {
			// Update existing rule
			setRules(
				rules.map((r) =>
					r.id === editing.id
						? {
								...r,
								...data,
								updatedAt: new Date().toISOString(),
							}
						: r,
				),
			);
			toast.success("Disciplinary rule updated successfully");
		} else {
			// Create new rule
			const newRule: DisciplinaryRule = {
				id: Date.now().toString(),
				...data,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};
			setRules([...rules, newRule]);
			toast.success("Disciplinary rule created successfully");
		}
		setIsModalOpen(false);
		reset();
	};

	const getSeverityBadgeVariant = (severity: string) => {
		switch (severity) {
			case "LOW":
				return "secondary";
			case "MEDIUM":
				return "default";
			case "HIGH":
				return "destructive";
			case "CRITICAL":
				return "destructive";
			default:
				return "secondary";
		}
	};

	const getCategoryBadgeVariant = (category: string) => {
		switch (category) {
			case "CONDUCT":
				return "destructive";
			case "PERFORMANCE":
				return "default";
			case "ATTENDANCE":
				return "secondary";
			case "SAFETY":
				return "destructive";
			default:
				return "secondary";
		}
	};

	// Table columns
	const columns: Column<DisciplinaryRule>[] = [
		{
			key: "ruleName",
			label: "Rule Name",
			render: (value, rule) => <div className="font-medium">{rule.ruleName}</div>,
		},
		{
			key: "category",
			label: "Category",
			render: (value, rule) => (
				<Badge variant={getCategoryBadgeVariant(rule.category)}>{rule.category}</Badge>
			),
		},
		{
			key: "severity",
			label: "Severity",
			render: (value, rule) => (
				<Badge variant={getSeverityBadgeVariant(rule.severity)}>{rule.severity}</Badge>
			),
		},
		{
			key: "description",
			label: "Description",
			render: (value, rule) => (
				<div className="max-w-md truncate text-sm text-gray-600">{rule.description}</div>
			),
		},
		{
			key: "defaultPenalty",
			label: "Default Penalty",
			render: (value, rule) => <div className="text-sm">{rule.defaultPenalty}</div>,
		},
		{
			key: "isActive",
			label: "Status",
			render: (value, rule) => (
				<Badge variant={rule.isActive ? "default" : "secondary"}>
					{rule.isActive ? "Active" : "Inactive"}
				</Badge>
			),
		},
	];

	// Custom actions renderer with dropdown
	const renderActions = (item: DisciplinaryRule) => {
		return (
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => handleView(item)}
					className="flex items-center justify-center w-8 h-8 p-0">
					<Eye className="h-4 w-4" />
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => openEdit(item)}
					className="flex items-center justify-center w-8 h-8 p-0">
					<Edit className="h-4 w-4" />
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => handleDelete(item)}
					className="flex items-center justify-center w-8 h-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50">
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
		);
	};

	return (
		<div className="space-y-6">
			<DataTable
				title="Disciplinary Action Rules"
				description="Create and manage disciplinary action rules for your organization"
				data={rules}
				columns={columns}
				searchFields={["ruleName", "description", "defaultPenalty"]}
				onAdd={openCreate}
				onEdit={openEdit}
				onDelete={handleDelete}
				renderActions={renderActions}
				isLoading={false}
				emptyMessage="No disciplinary rules created yet"
				emptyDescription="Get started by creating your first disciplinary action rule."
				searchWidth="w-80"
				itemsPerPage={10}
			/>

			{/* Create/Edit Modal */}
			<Modal
				open={isModalOpen}
				onOpenChange={setIsModalOpen}
				title={editing ? "Edit DA Rule" : "Create New DA Rule"}>
				<div className="mb-4">
					<p className="text-sm text-gray-600">
						Create and manage disciplinary action rules for your organization
					</p>
				</div>
				<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
					<div>
						<label className="block text-sm font-medium mb-1">Rule Name *</label>
						<Input
							{...register("ruleName", { required: true })}
							placeholder="Enter rule name"
						/>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium mb-1">Category *</label>
							<Select
								options={categoryOptions}
								value={watch("category")}
								onChange={(value) => setValue("category", value as any)}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium mb-1">Severity *</label>
							<Select
								options={severityOptions}
								value={watch("severity")}
								onChange={(value) => setValue("severity", value as any)}
							/>
						</div>
					</div>

					<div>
						<label className="block text-sm font-medium mb-1">Description *</label>
						<textarea
							{...register("description", { required: true })}
							placeholder="Enter description"
							rows={4}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--gt-500)] focus:border-transparent resize-none"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium mb-1">Default Penalty *</label>
						<Input
							{...register("defaultPenalty", { required: true })}
							placeholder="Enter default penalty"
						/>
					</div>

					<div className="flex items-center space-x-2">
						<input
							type="checkbox"
							id="isActive"
							{...register("isActive")}
							className="rounded"
						/>
						<label htmlFor="isActive" className="text-sm font-medium">
							Active
						</label>
					</div>

					<div className="flex justify-end space-x-2 pt-4">
						<Button type="button" variant="outline" onClick={handleCloseModal}>
							Cancel
						</Button>
						<Button type="submit">{editing ? "Update" : "Create"} Rule</Button>
					</div>
				</form>
			</Modal>

			{/* View Modal */}
			<Modal
				open={isViewModalOpen}
				onOpenChange={setIsViewModalOpen}
				title="Disciplinary Rule Details">
				{viewing && (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="text-sm font-medium text-gray-500">
									Rule Name
								</label>
								<p className="text-sm font-medium">{viewing.ruleName}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-gray-500">
									Category
								</label>
								<div className="mt-1">
									<Badge variant={getCategoryBadgeVariant(viewing.category)}>
										{viewing.category}
									</Badge>
								</div>
							</div>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-500">Severity</label>
							<div className="mt-1">
								<Badge variant={getSeverityBadgeVariant(viewing.severity)}>
									{viewing.severity}
								</Badge>
							</div>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-500">Description</label>
							<p className="text-sm mt-1">{viewing.description}</p>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-500">
								Default Penalty
							</label>
							<p className="text-sm mt-1">{viewing.defaultPenalty}</p>
						</div>
						<div>
							<label className="text-sm font-medium text-gray-500">Status</label>
							<div className="mt-1">
								<Badge variant={viewing.isActive ? "default" : "secondary"}>
									{viewing.isActive ? "Active" : "Inactive"}
								</Badge>
							</div>
						</div>
					</div>
				)}
			</Modal>
		</div>
	);
}
