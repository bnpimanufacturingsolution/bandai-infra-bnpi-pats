import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import logo from "@/assets/logo.png";

export function HeroTemplate() {
	return (
		<section className="py-20 md:py-28">
			<div className="container px-4 md:px-6 max-w-7xl mx-auto">
				<div className="grid gap-6 lg:grid-cols-2 lg:gap-12 items-center">
					<div className="space-y-4">
						<h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
							Build Amazing Web Applications
						</h1>
						<p className="text-muted-foreground md:text-xl">
							A modern React application template built with React Router, TypeScript,
							and Tailwind CSS. Start building your next great project with
							confidence.
						</p>
						<div className="flex flex-col sm:flex-row gap-3 pt-4">
							<Button size="lg" className="w-full sm:w-auto">
								Get Started
							</Button>
							<Button size="lg" variant="outline" className="w-full sm:w-auto">
								Learn More
							</Button>
						</div>
					</div>
					<div className="relative h-[350px] w-full rounded-xl overflow-hidden">
						<Image
							src={logo}
							alt="UZARO HR Logo"
							className="w-full h-full"
							height={350}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
