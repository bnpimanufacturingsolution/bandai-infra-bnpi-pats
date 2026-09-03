import { Text } from "@/components/atoms/Text";
import { Mail, Shield, FileText } from "lucide-react";

export const PageFooter = () => {
	const currentYear = new Date().getFullYear();

	return (
		<footer className="mt-12 py-8 border-t border-border">
			<div className="max-w-4xl mx-auto px-4">
				<div className="flex flex-col sm:flex-row items-center justify-between gap-4">
					{/* Support Link */}
					<a
						href="mailto:support@bandai-hris.com"
						className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
						<Mail className="h-4 w-4" />
						<span className="text-sm">Contact Support</span>
					</a>

					{/* Legal Links */}
					<div className="flex items-center gap-6">
						<a
							href="#privacy"
							className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
							<Shield className="h-4 w-4" />
							Privacy Notice
						</a>
						<a
							href="#terms"
							className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
							<FileText className="h-4 w-4" />
							Terms
						</a>
					</div>
				</div>

				{/* Data Usage Disclaimer */}
				<div className="mt-6 text-center">
					<Text variant="caption" className="text-muted-foreground max-w-2xl mx-auto">
						Your personal data is processed in accordance with our privacy policy.
						Interview scheduling data is used solely for recruitment purposes and will
						be retained according to our data retention policy.
					</Text>
				</div>

				{/* Copyright */}
				<div className="mt-4 text-center">
					<Text variant="caption" className="text-muted-foreground">
						© {currentYear} Bandai HRIS. All rights reserved.
					</Text>
				</div>
			</div>
		</footer>
	);
};
