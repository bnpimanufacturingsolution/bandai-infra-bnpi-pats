import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

export function ApplicationSuccess({ ms }: { ms: number }) {
	const [countdown, setCountdown] = useState(ms);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		setIsVisible(true);
		const timer = setInterval(() => {
			setCountdown((prev) => {
				if (prev <= 1) {
					clearInterval(timer);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		return () => clearInterval(timer);
	}, []);

	return (
		<div className="flex flex-col items-center justify-center py-10 sm:py-14">
			<div
				className={`mx-auto w-full max-w-md px-2 text-center transition-all duration-500 ${
					isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
				}`}>
				<div
					className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center transition-transform duration-500 ${
						isVisible ? "scale-100" : "scale-90"
					}`}>
					<CheckCircle2 className="h-16 w-16 text-[var(--theme-red)]" strokeWidth={1.5} />
				</div>

				<h2 className="font-heading text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[1.65rem]">
					Application submitted
				</h2>
				<p className="mx-auto mt-3 max-w-sm text-pretty text-sm leading-relaxed text-[#5f5f63]">
					Thank you for applying. We&apos;ll review your application and respond within
					2–3 business days.
				</p>
				{countdown > 0 ? (
					<p className="mt-5 text-xs tabular-nums text-neutral-400">
						Returning to job listings in {countdown}s…
					</p>
				) : null}
			</div>
		</div>
	);
}
