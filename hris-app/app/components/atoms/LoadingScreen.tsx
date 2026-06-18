import React from "react";

interface LoadingScreenProps {
	message?: string;
	subtitle?: string;
	variant?: "full" | "minimal";
}

const resolvePhaseLabel = (message?: string): string => {
	const normalized = (message || "").toLowerCase();

	if (normalized.includes("redirect")) return "Route handoff";
	if (normalized.includes("workspace")) return "Workspace load";
	if (normalized.includes("profile")) return "Profile sync";
	if (normalized.includes("permission")) return "Permission gate";
	if (normalized.includes("session")) return "Session validation";

	return "Authenticating";
};

const ProgressRing = ({ compact = false }: { compact?: boolean }) => {
	const size = compact ? 74 : 110;
	const strokeWidth = compact ? 6 : 8;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;

	return (
		<div className="relative flex items-center justify-center">
			<svg
				className={`${compact ? "h-[74px] w-[74px]" : "h-[110px] w-[110px]"} animate-[spin_1.8s_linear_infinite]`}
				viewBox={`0 0 ${size} ${size}`}
				fill="none"
				aria-hidden="true">
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					stroke="#eee6dc"
					strokeWidth={strokeWidth}
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					stroke="url(#bandai-loader-gradient)"
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeDasharray={`${circumference * 0.34} ${circumference}`}
					strokeDashoffset={circumference * 0.12}
				/>
				<defs>
					<linearGradient
						id="bandai-loader-gradient"
						x1="0"
						y1={size / 2}
						x2={size}
						y2={size / 2}
						gradientUnits="userSpaceOnUse">
						<stop stopColor="#e60012" />
						<stop offset="0.55" stopColor="#ff7200" />
						<stop offset="1" stopColor="#ffb35e" />
					</linearGradient>
				</defs>
			</svg>

			<div className="absolute inset-0 flex items-center justify-center">
				<div
					className={`rounded-full border border-orange-100 bg-white/92 shadow-inner ${
						compact ? "h-11 w-11" : "h-16 w-16"
					} flex items-center justify-center`}>
					<div className="flex items-center gap-1.5">
						<span className="h-2.5 w-2.5 rounded-full bg-[#e60012] animate-pulse" />
						<span className="h-2.5 w-2.5 rounded-full bg-[#ff8200] animate-pulse [animation-delay:180ms]" />
						<span className="h-2.5 w-2.5 rounded-full bg-[#ffbf7f] animate-pulse [animation-delay:360ms]" />
					</div>
				</div>
			</div>
		</div>
	);
};

const LoadingScreen: React.FC<LoadingScreenProps> = ({
	message = "Preparing workspace",
	subtitle = "Syncing your Bandai HR experience",
	variant = "full",
}) => {
	const phaseLabel = resolvePhaseLabel(message);
	const isMinimal = variant === "minimal";

	return (
		<div
			className={`relative overflow-hidden ${
				isMinimal
					? "flex min-h-screen items-center justify-center bg-[#f1eee9]"
					: "min-h-screen bg-[#ece9e2]"
			}`}>
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(230,0,18,0.06),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(255,130,0,0.09),_transparent_28%)]" />
			<div
				className={`relative z-10 w-full px-6 ${
					isMinimal
						? "mx-auto max-w-sm"
						: "mx-auto flex min-h-screen max-w-3xl items-center justify-center py-10"
				}`}>
				<div
					className={`rounded-[28px] border border-white/80 bg-white/92 shadow-[0_24px_70px_rgba(56,44,18,0.10)] backdrop-blur-sm ${
						isMinimal ? "p-6" : "w-full max-w-xl p-8 sm:p-10"
					}`}>
					<div
						className={`flex ${
							isMinimal
								? "flex-col items-center gap-5 text-center"
								: "flex-col gap-7 text-center"
						}`}>
						<div className="space-y-3">
							<div className="inline-flex items-center justify-center rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-orange-700">
								Bandai Namco HRIS
							</div>
						</div>

						<div className="flex flex-col items-center gap-4">
							<ProgressRing compact={isMinimal} />
							<div className="space-y-2">
								<div className="text-[11px] font-black uppercase tracking-[0.24em] text-orange-600">
									{phaseLabel}
								</div>
								{message && (
									<h1
										className={`font-black tracking-tight text-neutral-900 ${
											isMinimal ? "text-xl" : "text-3xl sm:text-[2rem]"
										}`}>
										{message}
									</h1>
								)}
								{subtitle && (
									<p
										className={`mx-auto max-w-md font-medium leading-6 text-neutral-500 ${
											isMinimal ? "text-sm" : "text-sm sm:text-base"
										}`}>
										{subtitle}
									</p>
								)}
							</div>
						</div>

						<div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500">
							<span>Securing your access</span>
							<span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700">
								In progress
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default LoadingScreen;
