import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";

export type ExportScope = "current" | "all";

interface ExportScopeModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (scope: ExportScope) => void | Promise<void>;
	isLoading?: boolean;
	entityLabel?: string;
	currentCount: number;
}

export function ExportScopeModal({
	open,
	onOpenChange,
	onConfirm,
	isLoading = false,
	entityLabel = "records",
	currentCount,
}: ExportScopeModalProps) {
	const scopes: Array<{
		value: ExportScope;
		title: string;
		description: string;
	}> = [
		{
			value: "current",
			title: "Current page",
			description: `Export the ${currentCount} ${entityLabel} currently shown in the table.`,
		},
		{
			value: "all",
			title: "Whole list",
			description: `Export up to 1000 filtered ${entityLabel} from the full list.`,
		},
	];

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title="Export CSV"
			description="Choose what to include in this download."
			className="sm:max-w-md">
			<div className="space-y-4">
				<div className="space-y-3">
					{scopes.map((scope) => (
						<button
							key={scope.value}
							type="button"
							disabled={isLoading}
							onClick={() => void onConfirm(scope.value)}
							className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60">
							<p className="text-sm font-semibold text-slate-900">{scope.title}</p>
							<p className="mt-1 text-xs text-slate-600">{scope.description}</p>
						</button>
					))}
				</div>

				<div className="flex justify-end border-t pt-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isLoading}>
						Cancel
					</Button>
				</div>
			</div>
		</Modal>
	);
}
