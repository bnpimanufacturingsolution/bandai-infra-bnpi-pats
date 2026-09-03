import React from "react";

const BANDAI_LOGO_URL =
	"https://res.cloudinary.com/dyal0wstg/image/upload/v1759107126/Bandai_Ni_Bryan_1_1_ruj2ty.webp";

interface LoadingScreenProps {
	/** Short status line shown under the loader. Prefer 1–4 words. */
	message?: string;
	/** Screen-reader only context; not shown visually. */
	subtitle?: string;
	variant?: "full" | "minimal";
	/** Optional logo override; defaults to login Bandai mark. */
	logoUrl?: string;
}

/**
 * Branded full-screen loader — logo + soft indeterminate bar.
 * Intentionally sparse: no phase labels, cards, or status chrome.
 */
const LoadingScreen: React.FC<LoadingScreenProps> = ({
	message,
	subtitle,
	variant = "full",
	logoUrl = BANDAI_LOGO_URL,
}) => {
	const isMinimal = variant === "minimal";
	const statusId = React.useId();
	const descriptionId = React.useId();

	return (
		<div
			role="status"
			aria-live="polite"
			aria-busy="true"
			aria-labelledby={message ? statusId : undefined}
			aria-describedby={subtitle ? descriptionId : undefined}
			className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white">
			{/* Soft ambient wash — matches login neutrality, brand-primary whisper only */}
			<div
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,_color-mix(in_oklab,var(--primary)_6%,transparent),_transparent_55%)]"
				aria-hidden
			/>

			{/* Motion keyframes scoped to this screen */}
			<style>{`
				@keyframes bandai-loader-fade {
					from { opacity: 0; transform: translateY(8px); }
					to { opacity: 1; transform: translateY(0); }
				}
				@keyframes bandai-loader-bar {
					0% { transform: translateX(-120%); }
					100% { transform: translateX(320%); }
				}
				@keyframes bandai-loader-logo {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.72; }
				}
			`}</style>

			<div
				className="relative z-10 flex w-full max-w-xs flex-col items-center px-6"
				style={{ animation: "bandai-loader-fade 480ms cubic-bezier(0.22, 1, 0.36, 1) both" }}>
				<img
					src={logoUrl}
					alt="Bandai Namco"
					className={`w-auto object-contain ${isMinimal ? "h-8" : "h-10"}`}
					style={{ animation: "bandai-loader-logo 2.4s ease-in-out infinite" }}
					draggable={false}
				/>

				{/* Indeterminate bar — smooth, continuous, low visual weight */}
				<div
					className={`relative mt-10 w-full overflow-hidden rounded-full bg-neutral-100 ${
						isMinimal ? "h-[2px] max-w-[9rem]" : "h-[2.5px] max-w-[11rem]"
					}`}
					aria-hidden>
					<div
						className="absolute inset-y-0 left-0 w-[42%] rounded-full bg-brand-primary"
						style={{
							animation: "bandai-loader-bar 1.15s cubic-bezier(0.4, 0, 0.2, 1) infinite",
						}}
					/>
				</div>

				{message ? (
					<p
						id={statusId}
						className={`mt-6 text-center font-medium tracking-tight text-neutral-400 ${
							isMinimal ? "text-xs" : "text-sm"
						}`}>
						{message}
					</p>
				) : null}

				{subtitle ? (
					<span id={descriptionId} className="sr-only">
						{subtitle}
					</span>
				) : null}
			</div>
		</div>
	);
};

export default LoadingScreen;
