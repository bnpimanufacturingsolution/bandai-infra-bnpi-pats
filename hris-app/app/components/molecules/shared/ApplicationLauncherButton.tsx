import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "~/components/ui/popover";
import { ApplicationLauncherPopover } from "./ApplicationLauncherPopover";

export function ApplicationLauncherButton() {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					id="navbar-app-launcher"
					className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
					aria-label="Applications"
					aria-expanded={open}
					aria-haspopup="dialog">
					<LayoutGrid className="w-5 h-5" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="w-[350px] max-w-[calc(100vw-24px)] border-0 bg-transparent p-0 shadow-none"
				onOpenAutoFocus={(e) => e.preventDefault()}>
				<ApplicationLauncherPopover onClose={() => setOpen(false)} />
			</PopoverContent>
		</Popover>
	);
}
