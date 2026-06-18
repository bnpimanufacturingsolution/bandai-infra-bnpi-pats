import { Button } from "@/components/ui/button";

export function CTATemplate() {
	return (
		<section className="py-16 bg-primary text-primary-foreground">
			<div className="container px-4 md:px-6 max-w-7xl mx-auto">
				<div className="grid gap-6 lg:grid-cols-2 items-center">
					<div className="space-y-4">
						<h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
							Ready to Start Building?
						</h2>
						<p className="text-primary-foreground/80 md:text-xl">
							Get started with this template and build your next amazing application.
						</p>
					</div>
					<div className="flex justify-center lg:justify-end">
						<Button size="lg" variant="secondary" className="w-full sm:w-auto">
							Get Started
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}
