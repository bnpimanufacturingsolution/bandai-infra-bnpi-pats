import { MoreHorizontal, Download } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

interface ExportDropdownProps {
	fileBaseName: string;
}

export function ExportDropdown({ fileBaseName }: ExportDropdownProps) {
	// Export functions
	const downloadDummy = (filename: string, content: string) => {
		const element = document.createElement("a");
		const file = new Blob([content], { type: "text/plain" });
		element.href = URL.createObjectURL(file);
		element.download = filename;
		document.body.appendChild(element);
		element.click();
		document.body.removeChild(element);
	};

	const handleExportExcel = () => {
		downloadDummy(`${fileBaseName}.xlsx`, "binary");
	};

	const handleExportPdf = () => {
		downloadDummy(`${fileBaseName}.pdf`, "binary");
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100">
					<MoreHorizontal className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem onClick={handleExportExcel}>
					<Download className="h-4 w-4 mr-2" />
					Export Excel
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleExportPdf}>
					<Download className="h-4 w-4 mr-2" />
					Export PDF
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
