interface AuthTemplateProps {
	hero: React.ReactNode;
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
	title = "Welcome back",
	subtitle = "Please enter your details to sign in.",
	logoUrl = "https://res.cloudinary.com/dyal0wstg/image/upload/v1759107126/Bandai_Ni_Bryan_1_1_ruj2ty.webp",
	footerText = "© 2025 Bandai Namco Philippines Inc. All Rights Reserved.",
	signUpLinkText = "Sign up for free",
	signUpUrl = "/auth/register",
}: AuthTemplateProps) {
	return (
		<div className="h-screen w-full bg-white flex overflow-hidden font-sans">
			{/* Right Column - Hero/Image */}
			{hero}

			{/* Left Column - Form */}
			<div className="w-full lg:w-[45%] flex flex-col justify-center px-6 sm:px-12 lg:px-16 xl:px-24 py-8 bg-white z-20 shadow-2xl lg:shadow-[5px_0_30px_rgba(0,0,0,0.03)] animate-in fade-in slide-in-from-left-4 duration-700">
				<div className="w-full max-w-sm mx-auto">
					{/* Logo */}
					<div className="mb-8">
						<img src={logoUrl} alt="Logo" className="h-10 w-auto" />
					</div>

					{/* Header */}
					<div className="mb-6">
						<h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
							{title}
						</h1>
						<p className="text-gray-500 text-sm">{subtitle}</p>
					</div>

					{/* Form Content */}
					{form}
				</div>

				{/* Footer Copyright */}
				<div className="mt-10 text-center text-[10px] text-gray-400">{footerText}</div>
			</div>
		</div>
	);
}
