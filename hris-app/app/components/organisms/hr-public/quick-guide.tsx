import { ChevronDown, HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";

const QuickGuide = () => {
	return (
		<>
			<Popover>
				<PopoverTrigger asChild>
					<button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all border border-border">
						<HelpCircle className="w-4 h-4" />
						<span>Guide</span>
					</button>
				</PopoverTrigger>
				<PopoverContent className="w-[400px] p-0 shadow-2xl border-border/50" align="end">
					<div className="p-4 border-b border-border bg-muted/30">
						<div className="flex items-center gap-2">
							<div className="p-1.5 rounded-lg bg-primary/10 text-primary">
								<HelpCircle className="w-4 h-4" />
							</div>
							<div>
								<h4 className="font-bold text-sm leading-none">
									Recruitment Pipeline
								</h4>
								<p className="text-[11px] text-muted-foreground mt-1">
									Detailed guide for the 7-step candidate journey
								</p>
							</div>
						</div>
					</div>

					<div className="p-4 max-h-[300px] overflow-y-auto">
						<div className="space-y-3">
							{/* Step 1 */}
							<div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
								<div className="flex items-center gap-2 mb-1.5">
									<div className="w-6 h-6 rounded-full bg-slate-400 text-xs font-bold text-white flex items-center justify-center shrink-0">
										1
									</div>
									<span className="text-xs font-bold text-slate-700">
										New (Initial Application)
									</span>
								</div>
								<p className="text-[11px] text-slate-500 leading-normal">
									The starting point. Fresh applications that haven&apos;t been
									touched yet.
								</p>
							</div>

							<div className="flex justify-center -my-1">
								<ChevronDown className="w-4 h-4 text-slate-300" />
							</div>

							{/* Step 2 */}
							<div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
								<div className="flex items-center gap-2 mb-1.5">
									<div className="w-6 h-6 rounded-full bg-blue-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
										2
									</div>
									<span className="text-xs font-bold text-blue-700">
										Reviewing (HR Evaluation)
									</span>
								</div>
								<p className="text-[11px] text-blue-600 leading-normal">
									Triggered when an HR is assigned. This is where you verify
									documents and the &quot;Reviewing Checklist&quot; appears.
								</p>
							</div>

							<div className="flex justify-center -my-1">
								<ChevronDown className="w-4 h-4 text-blue-200" />
							</div>

							{/* Step 3 */}
							<div className="p-3 rounded-lg bg-cyan-50 border border-cyan-100">
								<div className="flex items-center gap-2 mb-1.5">
									<div className="w-6 h-6 rounded-full bg-cyan-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
										3
									</div>
									<span className="text-xs font-bold text-cyan-700">
										For Interview (Qualified)
									</span>
								</div>
								<p className="text-[11px] text-cyan-600 leading-normal">
									The candidate has passed the initial review and is ready for
									scheduling.
								</p>
							</div>

							<div className="flex justify-center -my-1">
								<ChevronDown className="w-4 h-4 text-cyan-200" />
							</div>

							{/* Step 4 */}
							<div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
								<div className="flex items-center gap-2 mb-1.5">
									<div className="w-6 h-6 rounded-full bg-indigo-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
										4
									</div>
									<span className="text-xs font-bold text-indigo-700">
										Interview Stage (Assessment)
									</span>
								</div>
								<p className="text-[11px] text-indigo-600 leading-normal">
									Actively undergoing interviews. This is the &quot;Interview
									Process&quot; where panelists evaluate performance.
								</p>
							</div>

							<div className="flex justify-center -my-1">
								<ChevronDown className="w-4 h-4 text-indigo-200" />
							</div>

							{/* Step 5 */}
							<div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
								<div className="flex items-center gap-2 mb-1.5">
									<div className="w-6 h-6 rounded-full bg-purple-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
										5
									</div>
									<span className="text-xs font-bold text-purple-700">
										Final Evaluation / Offer Prep
									</span>
								</div>
								<p className="text-[11px] text-purple-600 leading-normal">
									The intermediate phase where the hiring team makes a final
									decision and prepares the offer details.
								</p>
							</div>

							<div className="flex justify-center -my-1">
								<ChevronDown className="w-4 h-4 text-purple-200" />
							</div>

							{/* Step 6 */}
							<div className="p-3 rounded-lg bg-orange-50 border border-orange-100">
								<div className="flex items-center gap-2 mb-1.5">
									<div className="w-6 h-6 rounded-full bg-orange-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
										6
									</div>
									<span className="text-xs font-bold text-orange-700">
										Accepted Stage (Contract Phase)
									</span>
								</div>
								<p className="text-[11px] text-orange-600 leading-normal">
									The candidate has accepted the offer. The &quot;Contract&quot;
									badge appears while waiting for signed documents.
								</p>
							</div>

							<div className="flex justify-center -my-1">
								<ChevronDown className="w-4 h-4 text-orange-200" />
							</div>

							{/* Step 7 */}
							<div className="p-3 rounded-lg bg-green-50 border border-green-200 ring-2 ring-green-100/50">
								<div className="flex items-center gap-2 mb-1.5">
									<div className="w-6 h-6 rounded-full bg-green-500 text-xs font-bold text-white flex items-center justify-center shrink-0">
										7
									</div>
									<span className="text-xs font-bold text-green-700">
										Completed (Hired & Onboarded)
									</span>
								</div>
								<p className="text-[11px] text-green-700 font-medium leading-normal">
									Candidate is successfully hired. Applicant data is converted to
									an active Employee record.
								</p>
							</div>
						</div>
					</div>

					<div className="p-3 bg-muted/10 text-center border-t border-border">
						<p className="text-[10px] text-muted-foreground italic mb-2">
							Onboarded candidates transition to the Personnel Management module.
						</p>
						<button className="text-[10px] uppercase tracking-wider font-bold text-primary hover:underline">
							View Full Documentation
						</button>
					</div>
				</PopoverContent>
			</Popover>
		</>
	);
};

export default QuickGuide;
