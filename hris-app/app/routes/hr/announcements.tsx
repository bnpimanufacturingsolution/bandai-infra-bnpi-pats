import React from "react";
import { useForm } from "react-hook-form";
import { Input } from "~/components/atoms/Input";
import { Button } from "~/components/atoms/Button";
import { DataTable, type Column, type FilterOption } from "~/components/atoms/DataTable";
import { Badge } from "~/components/atoms/Badge";
import announcementsService, {
	type CreateAnnouncementRequest,
} from "~/services/announcements.service";
import { AuthGuard } from "~/guards/auth-guard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Trash2,
	Bold,
	Italic,
	Underline,
	AlignLeft,
	AlignCenter,
	AlignRight,
	List,
	ListOrdered,
	Image as ImageIcon,
	Link as LinkIcon,
	Palette,
	Minus,
	MoreVertical,
	Eye,
	Edit,
} from "lucide-react";
import { Modal } from "~/components/atoms/Modal";

// Rich Text Editor Component
const RichTextEditor = ({
	value,
	onChange,
}: {
	value: string;
	onChange: (val: string) => void;
}) => {
	const editorRef = React.useRef<HTMLDivElement>(null);
	const [showColorPicker, setShowColorPicker] = React.useState(false);
	const [showBgColorPicker, setShowBgColorPicker] = React.useState(false);

	React.useEffect(() => {
		if (editorRef.current && !editorRef.current.innerHTML) {
			editorRef.current.innerHTML = value || "";
		}
	}, [value]);

	const handleInput = () => {
		if (editorRef.current) {
			onChange(editorRef.current.innerHTML);
		}
	};

	const execCommand = (command: string, value?: string) => {
		document.execCommand(command, false, value);
		editorRef.current?.focus();
	};

	const insertImage = () => {
		const url = prompt("Enter image URL:");
		if (url) {
			execCommand("insertImage", url);
		}
	};

	const insertLink = () => {
		const url = prompt("Enter URL:");
		if (url) {
			execCommand("createLink", url);
		}
	};

	const applyColor = (color: string) => {
		execCommand("foreColor", color);
		setShowColorPicker(false);
	};

	const applyBgColor = (color: string) => {
		execCommand("backColor", color);
		setShowBgColorPicker(false);
	};

	const colors = [
		"#000000",
		"#434343",
		"#666666",
		"#999999",
		"#b7b7b7",
		"#cccccc",
		"#d9d9d9",
		"#efefef",
		"#f3f3f3",
		"#ffffff",
		"#980000",
		"#ff0000",
		"#ff9900",
		"#ffff00",
		"#00ff00",
		"#00ffff",
		"#4a86e8",
		"#0000ff",
		"#9900ff",
		"#ff00ff",
	];

	return (
		<div className="border rounded-lg overflow-hidden bg-white">
			{/* Toolbar */}
			<div className="border-b bg-gray-50 p-2 flex flex-wrap items-center gap-1">
				{/* Text Style Group */}
				<div className="flex items-center gap-1 border-r pr-2">
					<button
						type="button"
						onClick={() => execCommand("bold")}
						className="p-2 hover:bg-gray-200 rounded"
						title="Bold">
						<Bold className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={() => execCommand("italic")}
						className="p-2 hover:bg-gray-200 rounded"
						title="Italic">
						<Italic className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={() => execCommand("underline")}
						className="p-2 hover:bg-gray-200 rounded"
						title="Underline">
						<Underline className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={() => execCommand("strikeThrough")}
						className="p-2 hover:bg-gray-200 rounded"
						title="Strikethrough">
						<Minus className="w-4 h-4" />
					</button>
				</div>

				{/* Color Group */}
				<div className="flex items-center gap-1 border-r pr-2 relative">
					<div className="relative">
						<button
							type="button"
							onClick={() => {
								setShowColorPicker(!showColorPicker);
								setShowBgColorPicker(false);
							}}
							className="p-2 hover:bg-gray-200 rounded"
							title="Text Color">
							<Palette className="w-4 h-4" />
						</button>
						{showColorPicker && (
							<div className="absolute top-full left-0 mt-1 p-2 bg-white border rounded-lg shadow-lg z-10 grid grid-cols-10 gap-1">
								{colors.map((color) => (
									<button
										key={color}
										type="button"
										onClick={() => applyColor(color)}
										className="w-6 h-6 rounded border hover:scale-110 transition"
										style={{ backgroundColor: color }}
									/>
								))}
							</div>
						)}
					</div>
					<div className="relative">
						<button
							type="button"
							onClick={() => {
								setShowBgColorPicker(!showBgColorPicker);
								setShowColorPicker(false);
							}}
							className="p-2 hover:bg-gray-200 rounded"
							title="Background Color">
							<div
								className="w-4 h-4 border-2 border-gray-600"
								style={{ backgroundColor: "yellow" }}
							/>
						</button>
						{showBgColorPicker && (
							<div className="absolute top-full left-0 mt-1 p-2 bg-white border rounded-lg shadow-lg z-10 grid grid-cols-10 gap-1">
								{colors.map((color) => (
									<button
										key={color}
										type="button"
										onClick={() => applyBgColor(color)}
										className="w-6 h-6 rounded border hover:scale-110 transition"
										style={{ backgroundColor: color }}
									/>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Alignment Group */}
				<div className="flex items-center gap-1 border-r pr-2">
					<button
						type="button"
						onClick={() => execCommand("justifyLeft")}
						className="p-2 hover:bg-gray-200 rounded"
						title="Align Left">
						<AlignLeft className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={() => execCommand("justifyCenter")}
						className="p-2 hover:bg-gray-200 rounded"
						title="Align Center">
						<AlignCenter className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={() => execCommand("justifyRight")}
						className="p-2 hover:bg-gray-200 rounded"
						title="Align Right">
						<AlignRight className="w-4 h-4" />
					</button>
				</div>

				{/* Lists Group */}
				<div className="flex items-center gap-1 border-r pr-2">
					<button
						type="button"
						onClick={() => execCommand("insertUnorderedList")}
						className="p-2 hover:bg-gray-200 rounded"
						title="Bullet List">
						<List className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={() => execCommand("insertOrderedList")}
						className="p-2 hover:bg-gray-200 rounded"
						title="Numbered List">
						<ListOrdered className="w-4 h-4" />
					</button>
				</div>

				{/* Insert Group */}
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={insertLink}
						className="p-2 hover:bg-gray-200 rounded"
						title="Insert Link">
						<LinkIcon className="w-4 h-4" />
					</button>
					<button
						type="button"
						onClick={insertImage}
						className="p-2 hover:bg-gray-200 rounded"
						title="Insert Image">
						<ImageIcon className="w-4 h-4" />
					</button>
				</div>

				{/* Heading Dropdown */}
				<div className="ml-auto">
					<select
						onChange={(e) => execCommand("formatBlock", e.target.value)}
						className="h-8 rounded border px-2 text-sm bg-white"
						defaultValue="">
						<option value="">Normal</option>
						<option value="h1">Heading 1</option>
						<option value="h2">Heading 2</option>
						<option value="h3">Heading 3</option>
						<option value="h4">Heading 4</option>
						<option value="h5">Heading 5</option>
						<option value="h6">Heading 6</option>
					</select>
				</div>
			</div>

			{/* Editor Content */}
			<div
				ref={editorRef}
				contentEditable
				onInput={handleInput}
				className="min-h-[300px] p-4 outline-none prose max-w-none"
				style={{
					wordWrap: "break-word",
					overflowWrap: "break-word",
				}}
			/>
		</div>
	);
};

interface Announcement {
	id: string;
	title: string;
	priority: "low" | "normal" | "high";
	audience: "all" | "managers" | "employees";
	publishAt?: string;
	expiresAt?: string;
}

export default function HRAnnouncementsPage() {
	const {
		register,
		handleSubmit,
		reset,
		watch,
		setValue,
		formState: { isSubmitting },
	} = useForm<CreateAnnouncementRequest & { files?: File[] }>({
		defaultValues: { priority: "normal", audience: "all", message: "" },
	});

	const [open, setOpen] = React.useState(false);
	const [openDropdowns, setOpenDropdowns] = React.useState<{ [key: string]: boolean }>({});

	const queryClient = useQueryClient();

	const onSubmit = async (values: CreateAnnouncementRequest & { files?: File[] }) => {
		await announcementsService.create(values);
		reset({ title: "", message: "", priority: "normal", audience: "all" });
		alert("Announcement created");
		queryClient.invalidateQueries({ queryKey: ["announcements"] });
	};

	const { data } = useQuery({
		queryKey: ["announcements"],
		queryFn: () => announcementsService.list(),
	});

	// Mock data fallback for demo
	const mockRows: Announcement[] = Array.from({ length: 23 }).map((_, i) => ({
		id: `mock-${i + 1}`,
		title: `Quarterly Update ${i + 1}`,
		priority: (["low", "normal", "high"] as const)[i % 3],
		audience: (["all", "managers", "employees"] as const)[i % 3],
		publishAt: new Date(Date.now() - i * 86400000).toISOString(),
		expiresAt: new Date(Date.now() + (i + 7) * 86400000).toISOString(),
	}));

	const announcements: Announcement[] = data && data.length > 0 ? data : mockRows;

	const filterOptions: FilterOption[] = [
		{
			key: "priority",
			label: "Priority",
			options: [
				{ value: "low", label: "Low" },
				{ value: "normal", label: "Normal" },
				{ value: "high", label: "High" },
			],
		},
		{
			key: "audience",
			label: "Audience",
			options: [
				{ value: "all", label: "All" },
				{ value: "managers", label: "Managers" },
				{ value: "employees", label: "Employees" },
			],
		},
	];

	const columns: Column<Announcement>[] = [
		{
			key: "title",
			label: "Title",
			render: (value: string) => <div className="font-medium text-neutral-900">{value}</div>,
		},
		{
			key: "priority",
			label: "Priority",
			render: (value: string) => {
				const colorMap = {
					low: "bg-gray-100 text-gray-800",
					normal: "bg-blue-100 text-blue-800",
					high: "bg-red-100 text-red-800",
				};
				return (
					<Badge
						className={
							colorMap[value as keyof typeof colorMap] || "bg-gray-100 text-gray-800"
						}>
						{value}
					</Badge>
				);
			},
		},
		{
			key: "audience",
			label: "Audience",
			render: (value: string) => {
				const colorMap = {
					all: "bg-green-100 text-green-800",
					managers: "bg-purple-100 text-purple-800",
					employees: "bg-orange-100 text-orange-800",
				};
				return (
					<Badge
						className={
							colorMap[value as keyof typeof colorMap] || "bg-gray-100 text-gray-800"
						}>
						{value}
					</Badge>
				);
			},
		},
		{
			key: "publishAt",
			label: "Published",
			render: (value: string) => (
				<div className="text-sm text-neutral-900">
					{value ? new Date(value).toLocaleDateString() : "—"}
				</div>
			),
		},
		{
			key: "expiresAt",
			label: "Expires",
			render: (value: string) => (
				<div className="text-sm text-neutral-900">
					{value ? new Date(value).toLocaleDateString() : "—"}
				</div>
			),
		},
	];

	const handleView = (item: Announcement) => {
		console.log("View announcement:", item);
	};

	const handleEdit = (item: Announcement) => {
		console.log("Edit announcement:", item);
	};

	const handleDelete = (item: Announcement) => {
		console.log("Delete announcement:", item);
	};

	const toggleDropdown = (id: string) => {
		setOpenDropdowns((prev) => ({
			...prev,
			[id]: !prev[id],
		}));
	};

	const closeDropdown = (id: string) => {
		setOpenDropdowns((prev) => ({
			...prev,
			[id]: false,
		}));
	};

	const closeAllDropdowns = React.useCallback(() => {
		setOpenDropdowns({});
	}, []);

	React.useEffect(() => {
		const handleClickOutside = () => {
			closeAllDropdowns();
		};

		document.addEventListener("click", handleClickOutside);
		return () => document.removeEventListener("click", handleClickOutside);
	}, [closeAllDropdowns]);

	const renderActions = (item: Announcement) => (
		<div className="relative">
			<button
				onClick={(e) => {
					e.stopPropagation();
					toggleDropdown(item.id);
				}}
				className="p-1 hover:bg-neutral-100 rounded">
				<MoreVertical className="w-4 h-4" />
			</button>
			{openDropdowns[item.id] && (
				<div className="absolute right-0 top-8 bg-white border border-neutral-200 rounded-md shadow-lg z-10 min-w-[120px]">
					<button
						onClick={() => {
							handleView(item);
							closeDropdown(item.id);
						}}
						className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center gap-2">
						<Eye className="w-4 h-4" />
						View
					</button>
					<button
						onClick={() => {
							handleEdit(item);
							closeDropdown(item.id);
						}}
						className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center gap-2">
						<Edit className="w-4 h-4" />
						Edit
					</button>
					<button
						onClick={() => {
							handleDelete(item);
							closeDropdown(item.id);
						}}
						className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center gap-2 text-red-600">
						<Trash2 className="w-4 h-4" />
						Delete
					</button>
				</div>
			)}
		</div>
	);

	return (
		<AuthGuard requiredRole="hris-admin">
			<div className="w-full max-w-7xl mx-auto">
				{/* Composer entry like Facebook */}
				<div className="bg-white border rounded-lg p-4 mb-6">
					<button
						onClick={() => setOpen(true)}
						className="w-full text-left h-12 rounded-full border px-4 bg-neutral-50 hover:bg-neutral-100 text-neutral-600">
						Share an announcement...
					</button>
				</div>

				<Modal open={open} onOpenChange={setOpen}>
					<div className="max-w-4xl mx-auto">
						<form
							onSubmit={handleSubmit(async (v) => {
								await onSubmit(v);
								setOpen(false);
							})}
							className="space-y-4">
							{/* Header */}
							<div className="border-b pb-4">
								<h2 className="text-xl font-semibold text-center">
									Create Announcement
								</h2>
							</div>

							<div className="flex items-center gap-3">
								<div className="size-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500" />
								<div className="flex-1">
									<Input
										{...register("title", { required: true })}
										placeholder="Announcement title"
										className="text-lg font-medium"
									/>
								</div>
							</div>

							{/* Rich Text Editor */}
							<div>
								<RichTextEditor
									value={watch("message") || ""}
									onChange={(val: string) => setValue("message", val)}
								/>
							</div>

							{/* Media uploader */}
							<div className="rounded-xl border bg-neutral-50 p-3">
								<div className="flex items-center justify-between gap-3">
									<div className="text-sm font-medium text-neutral-700">
										Add to your announcement
									</div>
									<div className="flex items-center gap-2">
										<label className="inline-flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 bg-white border hover:bg-neutral-50">
											<ImageIcon className="w-4 h-4" />
											<input
												type="file"
												multiple
												accept="image/*,application/pdf"
												className="hidden"
												onChange={(e) =>
													setValue("files" as any, [
														...((watch("files") as unknown as File[]) ||
															[]),
														...Array.from(e.target.files || []),
													])
												}
											/>
											<span className="text-sm">Photo/Video</span>
										</label>
									</div>
								</div>

								{/* Preview */}
								{(watch("files")?.length || 0) > 0 && (
									<div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
										{((watch("files") as unknown as File[]) || []).map(
											(f, i) => (
												<div
													key={i}
													className="group relative border rounded-xl overflow-hidden bg-white">
													{f.type.startsWith("image/") ? (
														<img
															src={URL.createObjectURL(f)}
															alt={f.name}
															className="w-full h-36 object-cover"
														/>
													) : (
														<div className="h-36 w-full grid place-items-center text-xs px-2">
															{f.name}
														</div>
													)}
													<button
														type="button"
														onClick={() => {
															const arr = [
																...((watch(
																	"files",
																) as unknown as File[]) || []),
															];
															arr.splice(i, 1);
															setValue("files" as any, arr);
														}}
														className="absolute top-2 right-2 rounded-full bg-black/50 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition">
														Remove
													</button>
												</div>
											),
										)}
									</div>
								)}
							</div>

							{/* Advanced options */}
							<details className="rounded-lg border p-3 bg-white">
								<summary className="cursor-pointer text-sm font-medium text-neutral-700">
									Advanced options
								</summary>
								<div className="mt-3 grid grid-cols-2 gap-4">
									<div>
										<label className="text-sm text-neutral-600 mb-1 block">
											Priority
										</label>
										<select
											className="w-full h-10 rounded-md border px-2"
											{...register("priority")}>
											<option value="low">Low</option>
											<option value="normal">Normal</option>
											<option value="high">High</option>
										</select>
									</div>
									<div>
										<label className="text-sm text-neutral-600 mb-1 block">
											Audience
										</label>
										<select
											className="w-full h-10 rounded-md border px-2"
											{...register("audience")}>
											<option value="all">All</option>
											<option value="managers">Managers</option>
											<option value="employees">Employees</option>
										</select>
									</div>
									<div>
										<label className="text-sm text-neutral-600 mb-1 block">
											Publish At
										</label>
										<Input type="datetime-local" {...register("publishAt")} />
									</div>
									<div>
										<label className="text-sm text-neutral-600 mb-1 block">
											Expires At
										</label>
										<Input type="datetime-local" {...register("expiresAt")} />
									</div>
								</div>
							</details>

							{/* Footer */}
							<div className="flex justify-end gap-2 border-t pt-4">
								<Button
									type="button"
									onClick={() => setOpen(false)}
									variant="ghost">
									Cancel
								</Button>
								<Button type="submit" disabled={isSubmitting}>
									Publish
								</Button>
							</div>
						</form>
					</div>
				</Modal>
			</div>

			{/* DataTable */}
			<div className="mt-8">
				<DataTable<Announcement>
					title="Announcements"
					data={announcements}
					columns={columns}
					filters={filterOptions}
					searchFields={["title"]}
					renderActions={renderActions}
					onExportPDF={() => {
						console.log("Exporting announcements data to PDF");
					}}
					onExportExcel={() => {
						console.log("Exporting announcements data to Excel");
					}}
				/>
			</div>
		</AuthGuard>
	);
}
