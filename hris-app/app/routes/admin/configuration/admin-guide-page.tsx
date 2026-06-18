import { useState } from "react";
import {
	BookOpen,
	Eye,
	Save,
	Settings,
	PanelLeftClose,
	PanelLeft,
	ArrowLeft,
	Trash2,
	Edit,
	Plus,
	MoreHorizontal,
	Loader2,
} from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Badge } from "~/components/atoms/Badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";
import { type Page as GuidePage, type Guide } from "~/zod/guide.zod";
import { AdminSectionList } from "../../../components/organisms/admin/admin-section-list";
import { useGuideConfig } from "~/hooks/use-guide-config";
import { AdminContentEditor } from "../../../components/organisms/admin/admin-content-editor";
import {
	useGuides,
	useGuideWithSections,
	useDeleteGuide,
	useCreateGuide,
	useUpdateGuide,
} from "~/hooks/use-guide";
import { DataTable } from "~/components/atoms/DataTable";
import { CreateGuideModal } from "~/components/molecules/guide/create-guide-modal";
import { DeleteConfirmationModal } from "~/components/molecules/guide/delete-confirmation-modal";

enum ViewMode {
	LIST = "LIST",
	EDIT = "EDIT",
}

function AdminGuidePage() {
	const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.LIST);
	const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);

	// Modal States
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [guideToDelete, setGuideToDelete] = useState<Guide | null>(null);

	// List View Logic
	const { data: guidesData, isLoading: isLoadingGuides } = useGuides();
	const deleteGuideMutation = useDeleteGuide();
	const createGuideMutation = useCreateGuide();

	// Editor View Logic
	const { data: fullGuide, isLoading: isLoadingFullGuide } = useGuideWithSections(
		selectedGuideId || "",
		{ enabled: !!selectedGuideId && viewMode === ViewMode.EDIT },
	);

	const handleEdit = (guide: Guide) => {
		setSelectedGuideId(guide.id || null);
		setViewMode(ViewMode.EDIT);
	};

	const handleDeleteRequest = (guide: Guide) => {
		setGuideToDelete(guide);
		setIsDeleteModalOpen(true);
	};

	const handleConfirmDelete = async () => {
		if (guideToDelete?.id) {
			await deleteGuideMutation.mutateAsync(guideToDelete.id);
			setIsDeleteModalOpen(false);
			setGuideToDelete(null);
		}
	};

	const handleCreateNew = async (data: { title: string; description: string }) => {
		await createGuideMutation.mutateAsync({
			...data,
			sections: [],
			published: false,
			isDeleted: false,
		});
		setIsCreateModalOpen(false);
	};

	if (viewMode === ViewMode.LIST) {
		return (
			<div className="p-6">
				<DataTable
					title="Documentation Guides"
					description="Manage your system documentation and user guides."
					data={guidesData?.data?.guides || []}
					isLoading={isLoadingGuides}
					columns={[
						{ key: "title", label: "Title", sortable: true, searchable: true },
						{ key: "description", label: "Description", searchable: true },
						{
							key: "published",
							label: "Status",
							render: (val) => (
								<Badge variant={val ? "success" : "secondary"}>
									{val ? "Published" : "Draft"}
								</Badge>
							),
						},
						{
							key: "updatedAt",
							label: "Last Updated",
							render: (val) => (val ? new Date(val).toLocaleDateString() : "N/A"),
						},
					]}
					onAdd={() => setIsCreateModalOpen(true)}
					addButtonLabel="Create Guide"
					renderActions={(guide) => (
						<div className="flex items-center gap-2">
							<Button variant="ghost" size="sm" onClick={() => handleEdit(guide)}>
								<Edit className="h-4 w-4" />
							</Button>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="sm">
										<MoreHorizontal className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										onClick={() => handleDeleteRequest(guide)}
										className="text-destructive">
										<Trash2 className="h-4 w-4 mr-2" />
										Delete
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)}
				/>

				<CreateGuideModal
					isOpen={isCreateModalOpen}
					onClose={() => setIsCreateModalOpen(false)}
					onCreate={handleCreateNew}
					isPending={createGuideMutation.isPending}
				/>

				<DeleteConfirmationModal
					isOpen={isDeleteModalOpen}
					onClose={() => {
						setIsDeleteModalOpen(false);
						setGuideToDelete(null);
					}}
					onConfirm={handleConfirmDelete}
					isPending={deleteGuideMutation.isPending}
					title="Delete Guide"
					description={`Are you sure you want to delete "${guideToDelete?.title}"? This action cannot be undone.`}
				/>
			</div>
		);
	}

	return (
		<GuideEditorView
			guide={fullGuide}
			isLoading={isLoadingFullGuide}
			onBack={() => {
				setViewMode(ViewMode.LIST);
				setSelectedGuideId(null);
			}}
		/>
	);
}

interface EditorProps {
	guide?: Guide;
	isLoading: boolean;
	onBack: () => void;
}

function GuideEditorView({ guide, isLoading, onBack }: EditorProps) {
	const updateGuideMutation = useUpdateGuide();
	const guideActions = useGuideConfig(guide);
	const { config } = guideActions;

	const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
	const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
	const [showSettings, setShowSettings] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-screen bg-background text-center p-6">
				<div className="space-y-4">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
					<p className="text-muted-foreground font-medium">Loading guide content...</p>
				</div>
			</div>
		);
	}

	if (!guide) return null;

	// Find selected page
	let selectedPage: GuidePage | null = null;
	if (selectedSectionId && selectedPageId) {
		const section = config.sections.find((s) => s.id === selectedSectionId);
		selectedPage = section?.pages.find((p) => p.id === selectedPageId) || null;
	}

	const handleSelectPage = (sectionId: string, pageId: string) => {
		setSelectedSectionId(sectionId);
		setSelectedPageId(pageId);
		setShowSettings(false);
	};

	const handleSave = async () => {
		if (guide.id) {
			const { id: _, createdAt: __, updatedAt: ___, ...updatePayload } = config;
			await updateGuideMutation.mutateAsync({
				id: guide.id as string,
				payload: updatePayload,
			});
		}
	};

	return (
		<div className="flex h-screen bg-background relative">
			<main className="flex-1 flex flex-col overflow-hidden">
				<header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
					<div className="flex items-center gap-4">
						<Button
							variant="ghost"
							size="sm"
							onClick={onBack}
							className="hover:bg-accent">
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back
						</Button>
						<div className="h-4 w-px bg-border mx-2" />
						<h1 className="text-lg font-semibold text-foreground">
							{showSettings
								? "Guide Settings"
								: selectedPage
									? `Editing: ${selectedPage.title}`
									: "Select a page to edit"}
						</h1>
					</div>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							onClick={handleSave}
							disabled={updateGuideMutation.isPending}>
							{updateGuideMutation.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Saving...
								</>
							) : (
								<>
									<Save className="h-4 w-4 mr-2" />
									Save Changes
								</>
							)}
						</Button>
					</div>
				</header>

				<ScrollArea className="flex-1">
					<div className="p-8 max-w-5xl mx-auto">
						{showSettings ? (
							<div className="space-y-8">
								<div className="grid gap-6">
									<div className="space-y-2">
										<Label
											htmlFor="guide-title"
											className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
											Guide Title
										</Label>
										<Input
											id="guide-title"
											value={config.title}
											onChange={(e) =>
												guideActions.updateGuideInfo({
													title: e.target.value,
												})
											}
											placeholder="e.g. Employee Handbook"
											className="text-lg font-medium py-6"
										/>
									</div>
									<div className="space-y-2">
										<Label
											htmlFor="guide-description"
											className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
											Description
										</Label>
										<Textarea
											id="guide-description"
											value={config.description || ""}
											onChange={(e) =>
												guideActions.updateGuideInfo({
													description: e.target.value,
												})
											}
											placeholder="A brief description of your documentation..."
											className="min-h-[150px] text-base"
										/>
									</div>
								</div>
							</div>
						) : selectedPage && selectedSectionId ? (
							<AdminContentEditor
								sectionId={selectedSectionId}
								page={selectedPage}
								actions={guideActions}
							/>
						) : (
							<div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
								<div className="p-8 rounded-full bg-muted/50 border-2 border-dashed border-border">
									<BookOpen className="h-16 w-16 text-muted-foreground/30" />
								</div>
								<div className="space-y-2">
									<h2 className="text-2xl font-bold tracking-tight">
										No page selected
									</h2>
									<p className="text-muted-foreground max-w-sm mx-auto">
										Choose a page from the sidebar to begin editing or create
										your first section to get started.
									</p>
								</div>
							</div>
						)}
					</div>
				</ScrollArea>
			</main>

			<Button
				variant="ghost"
				size="sm"
				onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
				className={cn(
					"absolute right-[20rem] top-1/2 -translate-y-1/2 h-8 w-6 p-0 rounded-r-none z-10 transition-all duration-300 shadow-md border bg-card",
					sidebarCollapsed && "right-0",
				)}>
				{sidebarCollapsed ? (
					<PanelLeft className="h-4 w-4" />
				) : (
					<PanelLeftClose className="h-4 w-4" />
				)}
			</Button>

			<aside
				className={cn(
					"flex flex-col border-l border-border bg-card transition-all duration-300",
					sidebarCollapsed ? "w-0 overflow-hidden" : "w-80",
				)}>
				<div className="flex items-center justify-between h-14 px-5 border-b border-border">
					<div className="flex items-center gap-2">
						<BookOpen className="h-5 w-5 text-primary" />
						<span className="font-bold text-foreground">Guide Admin</span>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setShowSettings(!showSettings)}
						className={cn("h-8 w-8 p-0", showSettings && "bg-accent")}>
						<Settings className="h-4 w-4" />
					</Button>
				</div>

				<ScrollArea className="flex-1 p-4">
					<AdminSectionList
						sections={config.sections}
						actions={guideActions}
						selectedPageId={selectedPageId}
						onSelectPage={handleSelectPage}
					/>
				</ScrollArea>

				<div className="p-5 border-t border-border space-y-2 mt-auto">
					<Link to={`/guide/${guide.id}`} target="_blank" className="block">
						<Button variant="outline" className="w-full justify-start" size="sm">
							<Eye className="h-4 w-4 mr-2" />
							Preview Guide
						</Button>
					</Link>
				</div>
			</aside>
		</div>
	);
}

export default AdminGuidePage;
