import { Code } from "lucide-react";
import { Link } from "react-router";
import { SocialLinks } from "@/components/molecules/social-links";

export function Footer() {
	const footerLinks = {
		products: [
			{ name: "Components", to: "#" },
			{ name: "Templates", to: "#" },
			{ name: "Documentation", to: "#" },
		],
		company: [
			{ name: "About", to: "#" },
			{ name: "Blog", to: "#" },
			{ name: "Careers", to: "#" },
		],
		legal: [
			{ name: "Privacy Policy", to: "#" },
			{ name: "Terms of Service", to: "#" },
			{ name: "Cookie Policy", to: "#" },
		],
	};

	const socialLinks = [
		{
			name: "Facebook",
			to: "#",
			icon: (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="h-5 w-5">
					<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
				</svg>
			),
		},
		{
			name: "Twitter",
			to: "#",
			icon: (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="h-5 w-5">
					<path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path>
				</svg>
			),
		},
		{
			name: "Instagram",
			to: "#",
			icon: (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="h-5 w-5">
					<rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
					<path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
					<line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
				</svg>
			),
		},
		{
			name: "LinkedIn",
			to: "#",
			icon: (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="h-5 w-5">
					<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
					<rect x="2" y="9" width="4" height="12"></rect>
					<circle cx="4" cy="4" r="2"></circle>
				</svg>
			),
		},
	];

	return (
		<footer className="border-t py-6 md:py-8">
			<div className="container px-4 md:px-6 max-w-7xl mx-auto">
				<div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
					<div className="space-y-4">
						<div className="flex items-center gap-2">
							<Code className="h-6 w-6 text-primary" />
							<span className="text-lg font-bold">React Template</span>
						</div>
						<p className="text-sm text-muted-foreground">
							A modern React application template for building amazing web
							applications.
						</p>
					</div>
					<div className="space-y-4">
						<h3 className="text-sm font-bold uppercase tracking-wider">Products</h3>
						<ul className="space-y-2 text-sm">
							{footerLinks.products.map((link, index) => (
								<li key={index}>
									<Link
										to={link.to}
										className="text-muted-foreground hover:text-foreground">
										{link.name}
									</Link>
								</li>
							))}
						</ul>
					</div>
					<div className="space-y-4">
						<h3 className="text-sm font-bold uppercase tracking-wider">Company</h3>
						<ul className="space-y-2 text-sm">
							{footerLinks.company.map((link, index) => (
								<li key={index}>
									<Link
										to={link.to}
										className="text-muted-foreground hover:text-foreground">
										{link.name}
									</Link>
								</li>
							))}
						</ul>
					</div>
					<div className="space-y-4">
						<h3 className="text-sm font-bold uppercase tracking-wider">Legal</h3>
						<ul className="space-y-2 text-sm">
							{footerLinks.legal.map((link, index) => (
								<li key={index}>
									<Link
										to={link.to}
										className="text-muted-foreground hover:text-foreground">
										{link.name}
									</Link>
								</li>
							))}
						</ul>
					</div>
				</div>
				<div className="mt-8 border-t pt-6 flex flex-col sm:flex-row justify-between items-center">
					<p className="text-xs text-muted-foreground">
						© {new Date().getFullYear()} React Template. All rights reserved.
					</p>
					<SocialLinks links={socialLinks} />
				</div>
			</div>
		</footer>
	);
}
