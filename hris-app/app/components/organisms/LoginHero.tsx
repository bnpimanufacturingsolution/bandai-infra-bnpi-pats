/**
 * Pure visual background for the login surface.
 * No marketing copy — soft geometric shapes only.
 */
export function LoginHero() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 overflow-hidden"
		>
			{/* Soft base wash */}
			<div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(226,6,19,0.06),transparent_55%)]" />
			<div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_100%_100%,rgba(255,173,0,0.07),transparent_50%)]" />

			{/* Large soft orbs */}
			<div className="absolute -left-[18%] -top-[12%] h-[52vmin] w-[52vmin] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(226,6,19,0.12),rgba(226,6,19,0.03)_55%,transparent_70%)] blur-[2px]" />
			<div className="absolute -bottom-[20%] -right-[12%] h-[58vmin] w-[58vmin] rounded-full bg-[radial-gradient(circle_at_60%_40%,rgba(255,173,0,0.14),rgba(226,6,19,0.04)_50%,transparent_72%)]" />
			<div className="absolute right-[8%] top-[18%] h-[28vmin] w-[28vmin] rounded-full border border-[rgba(226,6,19,0.08)]" />
			<div className="absolute bottom-[22%] left-[10%] h-[18vmin] w-[18vmin] rounded-full border border-[rgba(0,0,0,0.04)]" />

			{/* Thin geometric arcs (SVG) */}
			<svg
				className="absolute left-1/2 top-1/2 h-[min(90vh,900px)] w-[min(90vh,900px)] -translate-x-1/2 -translate-y-1/2 opacity-[0.45]"
				viewBox="0 0 800 800"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<circle
					cx="400"
					cy="400"
					r="280"
					stroke="rgba(226,6,19,0.08)"
					strokeWidth="1"
				/>
				<circle
					cx="400"
					cy="400"
					r="340"
					stroke="rgba(0,0,0,0.04)"
					strokeWidth="1"
					strokeDasharray="4 10"
				/>
				<path
					d="M120 420 C 220 180, 580 180, 680 420"
					stroke="rgba(226,6,19,0.1)"
					strokeWidth="1.25"
					strokeLinecap="round"
				/>
				<path
					d="M160 500 C 280 620, 520 620, 640 500"
					stroke="rgba(255,173,0,0.14)"
					strokeWidth="1.25"
					strokeLinecap="round"
				/>
				{/* Small accent dots */}
				<circle cx="180" cy="280" r="3" fill="rgba(226,6,19,0.35)" />
				<circle cx="620" cy="300" r="2.5" fill="rgba(255,173,0,0.45)" />
				<circle cx="540" cy="560" r="2" fill="rgba(226,6,19,0.25)" />
			</svg>

			{/* Soft edge vignette */}
			<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(250,250,250,0.85)_100%)]" />
		</div>
	);
}
