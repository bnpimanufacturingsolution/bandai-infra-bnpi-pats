"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Gamepad2, Rocket } from "lucide-react";

interface WelcomeScreenProps {
	onNext: () => void;
}

export default function WelcomeScreen({ onNext }: WelcomeScreenProps) {
	return (
		<div className="w-full max-w-3xl mx-auto flex flex-col md:flex-row items-center gap-8 p-6">
			{/* Left Content */}
			<div className="flex-1 text-left animate-fade-in-left">
				<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-600 font-semibold text-[10px] uppercase mb-4 tracking-wider">
					<Sparkles className="w-3 h-3" />
					Fun for All into the Future
				</div>

				<h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-4 leading-tight">
					Welcome to <br />
					<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600">
						Bandai Namco
					</span>
				</h1>

				<p className="text-base text-muted-foreground mb-6 leading-relaxed max-w-md">
					We're thrilled to have you join our team of dreamers and creators. Get ready to
					help us share fun and inspiration with the world!
				</p>

				<div className="flex flex-col sm:flex-row gap-3">
					<Button
						onClick={onNext}
						size="default"
						className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-md transition-all hover:scale-105 rounded-full px-6 h-10 text-sm font-semibold">
						Start Onboarding <ArrowRight className="w-4 h-4 ml-2" />
					</Button>
				</div>
			</div>

			{/* Right Visual */}
			<div className="flex-1 relative animate-fade-in-right hidden md:block">
				<div className="relative z-10 grid grid-cols-2 gap-3">
					<div className="space-y-3 mt-6">
						<div className="p-4 rounded-xl bg-white shadow-lg border border-orange-100 transform -rotate-2 hover:rotate-0 transition-all duration-300">
							<div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mb-2">
								<Gamepad2 className="w-4 h-4" />
							</div>
							<h3 className="font-bold text-gray-900 text-sm">Iconic Games</h3>
							<p className="text-[10px] text-gray-500 mt-0.5">
								Home to Pac-Man, Tekken, and Elden Ring.
							</p>
						</div>
						<div className="p-4 rounded-xl bg-white shadow-lg border border-blue-100 transform rotate-2 hover:rotate-0 transition-all duration-300">
							<div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
								<Rocket className="w-4 h-4" />
							</div>
							<h3 className="font-bold text-gray-900 text-sm">Innovation</h3>
							<p className="text-[10px] text-gray-500 mt-0.5">
								Pushing the boundaries of entertainment technology.
							</p>
						</div>
					</div>
					<div className="space-y-3">
						<div className="p-4 rounded-xl bg-white shadow-lg border border-pink-100 transform rotate-3 hover:rotate-0 transition-all duration-300">
							<div className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center mb-2">
								<Sparkles className="w-4 h-4" />
							</div>
							<h3 className="font-bold text-gray-900 text-sm">Creativity</h3>
							<p className="text-[10px] text-gray-500 mt-0.5">
								Turning dreams into reality for fans worldwide.
							</p>
						</div>
					</div>
				</div>

				{/* Accents */}
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-gradient-to-tr from-orange-200/30 via-red-200/20 to-blue-200/30 blur-2xl rounded-full -z-10" />
			</div>
		</div>
	);
}
