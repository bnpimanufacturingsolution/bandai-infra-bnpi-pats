import type React from "react";
import { Link } from "react-router";

interface SocialLink {
	name: string;
	to: string;
	icon: React.ReactNode;
}

interface SocialLinksProps {
	links: SocialLink[];
}

export function SocialLinks({ links }: SocialLinksProps) {
	return (
		<div className="flex gap-4">
			{links.map((link, index) => (
				<Link
					key={index}
					to={link.to}
					className="text-muted-foreground hover:text-foreground">
					<span className="sr-only">{link.name}</span>
					{link.icon}
				</Link>
			))}
		</div>
	);
}
