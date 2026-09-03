import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ContactForm() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Send Us a Message</CardTitle>
				<CardDescription>
					Fill out the form below and we&apos;ll get back to you as soon as possible.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<label htmlFor="first-name" className="text-sm font-medium">
								First name
							</label>
							<input
								id="first-name"
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
								placeholder="John"
							/>
						</div>
						<div className="space-y-2">
							<label htmlFor="last-name" className="text-sm font-medium">
								Last name
							</label>
							<input
								id="last-name"
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
								placeholder="Doe"
							/>
						</div>
					</div>
					<div className="space-y-2">
						<label htmlFor="email" className="text-sm font-medium">
							Email
						</label>
						<input
							id="email"
							type="email"
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							placeholder="john.doe@example.com"
						/>
					</div>
					<div className="space-y-2">
						<label htmlFor="message" className="text-sm font-medium">
							Message
						</label>
						<textarea
							id="message"
							className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
							placeholder="Your message here..."
						/>
					</div>
					<Button className="w-full">Send Message</Button>
				</form>
			</CardContent>
		</Card>
	);
}
