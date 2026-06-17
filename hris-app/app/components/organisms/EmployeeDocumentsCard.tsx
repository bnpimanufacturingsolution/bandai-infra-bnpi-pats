import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "~/components/atoms/Badge";
import { Button } from "~/components/atoms/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { FileUpload } from "~/components/atoms/form/FileUpload";
import { useDocumentTypes } from "~/lib/hooks/useDocumentTypes";
import { useAuth } from "~/lib/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { AlertCircle, CheckCircle, Eye, File, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import {
	EMPLOYEE_DOCUMENT_ACCEPT,
	EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS,
	EMPLOYEE_DOCUMENT_MAX_SIZE_MB,
	EMPLOYEE_DOCUMENT_UPLOAD_COPY,
	validateEmployeeDocumentFile,
} from "~/lib/utils/document-file";

interface EmployeeDocumentsCardProps {
	employee: any;
	readonly?: boolean;
}

export function EmployeeDocumentsCard({ employee, readonly = false }: EmployeeDocumentsCardProps) {
	const { user } = useAuth();
	const [selectedDocTypeId, setSelectedDocTypeId] = useState<string | null>(null);
	const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
	const [fileStats, setFileStats] = useState<File | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [searchParams] = useSearchParams();
	const organizationId =
		employee?.organizationId || user?.organizationId || user?.organization?.id;
	const documentTypeParam = searchParams.get("documentType");
	const { data } = useDocumentTypes(
		{
			page: 1,
			limit: 100,
			sort: "displayOrder",
			order: "asc",
			filter: "isActive:true",
		},
		{ enabled: !!organizationId },
	);

	const documentTypes = (data?.documentTypes || []).filter(
		(documentType) => documentType.isActive && documentType.isEmployeeVisible,
	);
	const cards = useMemo(
		() =>
			documentTypes.map((documentType) => {
				const existingDoc =
					employee?.documents?.find(
						(document: any) =>
							document.documentTypeId === documentType.id ||
							String(document.type || "").toLowerCase() ===
								String(documentType.code || "").toLowerCase(),
					) || null;
				return {
					id: documentType.id,
					code: documentType.code,
					label: documentType.name,
					category: documentType.category || "Document",
					isRequired: !!documentType.isRequired,
					existingDoc,
				};
			}),
		[documentTypes, employee?.documents],
	);

	useEffect(() => {
		if (!documentTypeParam) return;
		const matched = cards.find(
			(item) => item.id === documentTypeParam || item.code === documentTypeParam,
		);
		if (matched) {
			setSelectedDocTypeId(matched.id);
			setIsUploadModalOpen(true);
		}
	}, [cards, documentTypeParam]);

	const selectedCard = cards.find((item) => item.id === selectedDocTypeId) || null;

	const handleSubmitUpload = () => {
		if (!fileStats || !selectedDocTypeId || !employee?.id) return;

		const fileError = validateEmployeeDocumentFile(fileStats);
		if (fileError) {
			toast.error(fileError);
			return;
		}

		setIsUploading(true);
		const formData = new FormData();
		formData.append("file", fileStats);
		formData.append("documentTypes", selectedDocTypeId);
		formData.append(
			"data",
			JSON.stringify({
				metadata: {
					...(employee?.metadata || {}),
					lastDocumentUpdate: new Date().toISOString(),
				},
			}),
		);

		import("~/lib/api-client").then(({ hrisApiClient }) => {
			hrisApiClient
				.patchForm(`/api/employee/${employee.id}`, formData)
				.then(() => {
					toast.success(`${selectedCard?.label || "Document"} uploaded successfully`);
					setIsUploadModalOpen(false);
					window.location.reload();
				})
				.catch(() => {
					toast.error("Failed to upload document");
				})
				.finally(() => {
					setIsUploading(false);
				});
		});
	};

	return (
		<Card className="col-span-1 overflow-hidden rounded-2xl border-0 shadow-lg lg:col-span-2">
			<CardHeader className="bg-gradient-to-br from-gray-50 to-gray-100">
				<CardTitle className="flex items-center gap-2 text-gray-800">
					<FileText className="h-5 w-5 text-orange-600" />
					Compliance & Documents
				</CardTitle>
			</CardHeader>
			<CardContent className="p-6">
				{cards.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50 p-5 text-sm text-orange-800">
						No document types are configured yet. Set them up first in HR Operations /
						Document Setup.
					</div>
				) : (
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{cards.map((doc) => {
							const isUploaded = !!doc.existingDoc?.fileUrl;

							return (
								<div
									key={doc.id}
									className={`rounded-xl border-2 p-4 transition-all ${
										isUploaded
											? "border-green-100 bg-green-50/50"
											: "border-gray-100 bg-white hover:border-orange-200"
									}`}>
									<div className="mb-3 flex items-start justify-between">
										<div
											className={`rounded-lg p-2 ${
												isUploaded
													? "bg-green-100 text-green-600"
													: "bg-gray-100 text-gray-500"
											}`}>
											<File className="h-5 w-5" />
										</div>
										{isUploaded ? (
											<Badge className="bg-green-100 text-green-700 hover:bg-green-100">
												<CheckCircle className="mr-1 h-3 w-3" />
												Uploaded
											</Badge>
										) : (
											<Badge
												variant="outline"
												className="border-gray-300 text-gray-500">
												<AlertCircle className="mr-1 h-3 w-3" />
												Missing
											</Badge>
										)}
									</div>

									<h3 className="mb-1 font-medium text-gray-900">{doc.label}</h3>
									<p className="mb-4 text-xs text-gray-500">
										{doc.category}
										{doc.isRequired ? " • Required" : ""}
									</p>

									<div className="flex gap-2">
										{isUploaded ? (
											<>
												<Button
													variant="outline"
													size="sm"
													className="w-full text-xs"
													onClick={() =>
														window.open(
															doc.existingDoc.fileUrl,
															"_blank",
														)
													}>
													<Eye className="mr-1 h-3 w-3" />
													View
												</Button>
												{!readonly ? (
													<Button
														variant="outline"
														size="sm"
														className="w-full text-xs hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
														onClick={() => {
															setSelectedDocTypeId(doc.id);
															setFileStats(null);
															setIsUploadModalOpen(true);
														}}>
														Update
													</Button>
												) : null}
											</>
										) : !readonly ? (
											<Button
												size="sm"
												className="w-full bg-gray-900 text-white hover:bg-gray-800"
												onClick={() => {
													setSelectedDocTypeId(doc.id);
													setFileStats(null);
													setIsUploadModalOpen(true);
												}}>
												<Upload className="mr-2 h-3 w-3" />
												Upload
											</Button>
										) : null}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>

			<Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Upload {selectedCard?.label || "Document"}</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<FileUpload
							name="document"
							value={fileStats}
							onChange={(file) => {
								if (!file) {
									setFileStats(null);
									return;
								}
								const fileError = validateEmployeeDocumentFile(file);
								if (fileError) {
									toast.error(fileError);
									setFileStats(null);
									return;
								}
								setFileStats(file);
							}}
							maxSize={EMPLOYEE_DOCUMENT_MAX_SIZE_MB}
							accept={EMPLOYEE_DOCUMENT_ACCEPT}
							allowedExtensions={EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS}
						/>
						<p className="text-xs text-gray-500">{EMPLOYEE_DOCUMENT_UPLOAD_COPY}</p>
						<div className="flex justify-end gap-2">
							<Button variant="outline" onClick={() => setIsUploadModalOpen(false)}>
								Cancel
							</Button>
							<Button
								onClick={handleSubmitUpload}
								disabled={!fileStats || isUploading}
								className="bg-orange-600 text-white hover:bg-orange-700">
								{isUploading ? "Uploading..." : "Upload Document"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
