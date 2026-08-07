interface AuthTemplateProps {
	hero?: React.ReactNode;
	form: React.ReactNode;
	title?: string;
	subtitle?: string;
	logoUrl?: string;
	footerText?: string;
	signUpLinkText?: string;
	signUpUrl?: string;
}

export function AuthTemplate({
	hero,
	form,
	title = "Sign in",
	subtitle,
	logoUrl = "https://res.cloudinary.com/dyal0wstg/image/upload/v1759107126/Bandai_Ni_Bryan_1_1_ruj2ty.webp",
	footerText = "© 2026 Bandai Namco Philippines Inc.",
}: AuthTemplateProps) {
	return (
		<div className="grid h-screen w-full overflow-hidden bg-white font-sans text-gray-900 lg:grid-cols-5">
			{/* Left — art + title (spans 3/5 on desktop) */}
			{hero}

			{/* Right — form (spans 2/5 on desktop) */}
			<div className="relative z-10 flex min-h-0 w-full flex-col justify-center bg-white px-6 py-10 sm:px-12 lg:col-span-2 lg:px-12 xl:px-16">
				<div className="mx-auto w-full max-w-sm">
					<div className="mb-8">
						<img
							src={logoUrl}
							alt="Bandai Namco"
							className="mb-8 h-9 w-auto select-none"
						/>
						<h1 className="text-2xl font-semibold tracking-tight text-gray-900">
							{title}
						</h1>
						{subtitle ? (
							<p className="mt-2 text-sm leading-relaxed text-gray-500">{subtitle}</p>
						) : null}
					</div>

					{form}

					{footerText ? (
						<p className="mt-12 text-center text-xs text-gray-400 lg:text-left">
							{footerText}
						</p>
					) : null}
				</div>
			</div>
		</div>
	);
}
