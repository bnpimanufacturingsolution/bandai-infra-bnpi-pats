/**
 * Left panel: minimal modern art + short title.
 * No marketing pills, status cards, or slogan spam.
 */
export function LoginHero() {
	return (
		<div className="relative hidden min-h-screen overflow-hidden bg-neutral-50 lg:col-span-3 lg:flex lg:flex-col lg:justify-between">
			{/* Background art */}
			<div aria-hidden="true" className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-gradient-to-br from-red-50 via-neutral-50 to-amber-50" />
				<div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-red-500/10 blur-3xl" />
				<div className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-amber-400/15 blur-3xl" />
				<div className="absolute right-1/4 top-1/3 h-64 w-64 rounded-full bg-red-600/5 blur-2xl" />

				<svg
					className="absolute inset-0 h-full w-full"
					viewBox="0 0 800 900"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					preserveAspectRatio="xMidYMid slice"
				>
					<circle
						cx="520"
						cy="420"
						r="180"
						stroke="rgba(226,6,19,0.12)"
						strokeWidth="1"
					/>
					<circle
						cx="520"
						cy="420"
						r="260"
						stroke="rgba(0,0,0,0.05)"
						strokeWidth="1"
					/>
					<circle
						cx="520"
						cy="420"
						r="340"
						stroke="rgba(226,6,19,0.06)"
						strokeWidth="1"
						strokeDasharray="6 12"
					/>
					<path
						d="M80 520 C 200 280, 420 240, 620 360"
						stroke="rgba(226,6,19,0.14)"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
					<path
						d="M120 640 C 280 740, 500 720, 680 580"
						stroke="rgba(255,173,0,0.22)"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
					<circle cx="200" cy="300" r="3.5" fill="rgba(226,6,19,0.4)" />
					<circle cx="640" cy="260" r="2.5" fill="rgba(255,173,0,0.55)" />
					<circle cx="480" cy="620" r="2" fill="rgba(226,6,19,0.28)" />
					<line
						x1="120"
						y1="160"
						x2="120"
						y2="280"
						stroke="rgba(0,0,0,0.08)"
						strokeWidth="1"
					/>
				</svg>
			</div>

			{/* Accent bar */}
			<div className="relative z-10 px-12 pt-12 xl:px-16 xl:pt-14">
				<div className="inline-flex h-2 w-8 rounded-full bg-red-600" />
			</div>

			{/* Title */}
			<div className="relative z-10 flex flex-1 flex-col justify-center px-12 xl:px-16">
				<p className="mb-4 text-sm font-medium tracking-wide text-red-600">
					Bandai Namco Philippines
				</p>
				<h2 className="max-w-md text-4xl font-semibold leading-tight tracking-tight text-gray-900 xl:text-5xl">
					Your workplace,
					<br />
					<span className="text-red-600">simplified.</span>
				</h2>
				<p className="mt-5 max-w-sm text-base leading-relaxed text-gray-500">
					Secure access to HR, attendance, and workforce tools.
				</p>
			</div>

			{/* Footer label */}
			<div className="relative z-10 px-12 pb-12 xl:px-16 xl:pb-14">
				<p className="text-xs text-gray-400">Employee Portal</p>
			</div>
		</div>
	);
}
