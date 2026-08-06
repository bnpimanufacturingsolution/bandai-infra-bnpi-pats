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
		<div className="relative min-h-screen w-full overflow-hidden bg-neutral-50 font-sans text-gray-900">
			{/* Minimalist background art layer */}
			{hero}

			{/* Form */}
			<div className="relative z-10 flex min-h-screen w-full items-center justify-center px-6 py-12">
				<div className="mx-auto w-full max-w-sm">
					<div className="mb-10 flex flex-col items-center text-center">
						<img
							src={logoUrl}
							alt="Bandai Namco"
							className="mb-8 h-9 w-auto select-none"
						/>
						<h1 className="text-2xl font-semibold tracking-tight text-gray-900 text-balance">
							{title}
						</h1>
						{subtitle ? (
							<p className="mt-2 text-sm leading-relaxed text-gray-500">{subtitle}</p>
						) : null}
					</div>

					{form}

					{footerText ? (
						<p className="mt-12 text-center text-xs leading-none text-gray-400">
							{footerText}
						</p>
					) : null}
				</div>
			</div>
		</div>
	);
}
