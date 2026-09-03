import { Button } from "@/components/ui/button";
import {
	ArrowRight,
	ChevronLeft,
	Gamepad,
	ToyBrick,
	Clapperboard,
	Globe2,
	Building2,
	Sparkles,
	Trophy,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CompanyIntroductionProps {
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

export default function CompanyIntroduction({ onNext, onBack, onSkip }: CompanyIntroductionProps) {
	const [activeTab, setActiveTab] = useState<"overview" | "games" | "toys" | "anime">("overview");

	const sections = {
		overview: {
			title: "Company Overview",
			icon: <Building2 className="w-5 h-5" />,
			content: (
				<div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
					<p className="text-base text-gray-600 leading-relaxed">
						<span className="font-bold text-gray-900">Bandai Namco Holdings Inc.</span>{" "}
						is a major Japanese entertainment conglomerate known globally for its toys,
						video games, anime production, and amusement businesses.
					</p>

					<div className="grid grid-cols-2 gap-4">
						<div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
							<p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 group-hover:text-amber-500 transition-colors">
								Founded
							</p>
							<p className="text-base font-bold text-gray-900">Sept 29, 2005</p>
							<p className="text-xs text-gray-500 mt-1">Merger of Bandai & Namco</p>
						</div>
						<div className="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
							<p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 group-hover:text-blue-500 transition-colors">
								Headquarters
							</p>
							<p className="text-base font-bold text-gray-900">Tokyo, Japan</p>
							<p className="text-xs text-gray-500 mt-1">
								Global offices in US, EU, Asia
							</p>
						</div>
					</div>

					<div className="relative overflow-hidden p-6 rounded-2xl bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-xl group">
						<div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform duration-700">
							<Sparkles className="w-32 h-32" />
						</div>
						<p className="text-xs font-bold opacity-90 uppercase tracking-widest mb-2">
							Our Mission
						</p>
						<p className="text-2xl font-extrabold tracking-tight">
							"Fun for All into the Future"
						</p>
						<p className="text-sm opacity-90 mt-2 font-medium">
							Sharing dreams, fun, and inspiration worldwide.
						</p>
					</div>
				</div>
			),
		},
		games: {
			title: "Video Games",
			icon: <Gamepad className="w-5 h-5" />,
			content: (
				<div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
					<p className="text-base text-gray-600">
						Bandai Namco Entertainment publishes some of the world's most beloved game
						franchises.
					</p>
					<div className="grid grid-cols-2 gap-4">
						{[
							{
								name: "Pac-Man",
								desc: "Arcade Icon",
								color: "bg-yellow-50 text-yellow-700 border-yellow-200",
								icon: "🍒",
							},
							{
								name: "Tekken",
								desc: "Fighting Game",
								color: "bg-red-50 text-red-700 border-red-200",
								icon: "🥊",
							},
							{
								name: "Dark Souls",
								desc: "Action RPG",
								color: "bg-stone-100 text-stone-700 border-stone-200",
								icon: "🔥",
							},
							{
								name: "Elden Ring",
								desc: "Open World",
								color: "bg-amber-50 text-amber-700 border-amber-200",
								icon: "💍",
							},
						].map((game) => (
							<div
								key={game.name}
								className={`${game.color} p-4 rounded-xl border transition-transform hover:-translate-y-1 hover:shadow-md`}>
								<div className="text-2xl mb-2">{game.icon}</div>
								<p className="font-bold text-sm">{game.name}</p>
								<p className="text-xs opacity-80">{game.desc}</p>
							</div>
						))}
					</div>
					<div className="p-4 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-500 mt-2 flex items-center gap-3">
						<Trophy className="w-4 h-4 text-orange-500" />
						Also publishing anime-licensed games like Dragon Ball, One Piece, and My
						Hero Academia.
					</div>
				</div>
			),
		},
		toys: {
			title: "Toys & Hobby",
			icon: <ToyBrick className="w-5 h-5" />,
			content: (
				<div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
					<p className="text-base text-gray-600">
						A cornerstone of revenue, producing model kits, figures, and collectibles.
					</p>
					<ul className="space-y-4">
						<li className="flex items-start gap-4 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:border-blue-200 transition-colors">
							<div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
								<span className="text-xl">🤖</span>
							</div>
							<div>
								<p className="text-base font-bold text-gray-900">Gunpla (Gundam)</p>
								<p className="text-sm text-gray-500">
									World-famous plastic model kits with incredible detail.
								</p>
							</div>
						</li>
						<li className="flex items-start gap-4 p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:border-pink-200 transition-colors">
							<div className="w-10 h-10 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center shrink-0">
								<span className="text-xl">💊</span>
							</div>
							<div>
								<p className="text-base font-bold text-gray-900">Gashapon</p>
								<p className="text-sm text-gray-500">
									Popular capsule toys sold globally in vending machines.
								</p>
							</div>
						</li>
					</ul>
				</div>
			),
		},
		anime: {
			title: "Anime & Film",
			icon: <Clapperboard className="w-5 h-5" />,
			content: (
				<div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
					<div className="p-6 rounded-2xl bg-indigo-50 border border-indigo-100 relative overflow-hidden">
						<div className="absolute top-0 right-0 w-32 h-32 bg-indigo-100 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
						<h4 className="font-bold text-indigo-900 text-lg mb-1 relative z-10">
							Bandai Namco Filmworks
						</h4>
						<p className="text-xs font-semibold text-indigo-500 mb-4 uppercase tracking-wider relative z-10">
							Formerly Sunrise Studio
						</p>
						<p className="text-sm text-indigo-800 leading-relaxed relative z-10">
							Producing legendary series like{" "}
							<span className="font-bold bg-indigo-200/50 px-1 rounded">
								Mobile Suit Gundam
							</span>{" "}
							and managing anime IP licensing worldwide.
						</p>
					</div>
					<div className="flex items-center gap-4 p-5 rounded-2xl border border-gray-100 bg-white shadow-sm">
						<div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
							<Globe2 className="w-6 h-6" />
						</div>
						<div>
							<p className="text-sm font-bold text-gray-900">Global Reach</p>
							<p className="text-xs text-gray-500 mt-1">
								Collaboration with partners like Sony to expand anime engagement.
							</p>
						</div>
					</div>
				</div>
			),
		},
	};

	return (
		<div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-6 lg:gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
			{/* Left Content - Navigation */}
			<div className="w-full md:w-1/3 flex flex-col gap-6">
				<div>
					<h2 className="text-2xl md:text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-red-600 mb-2 leading-tight">
						Bandai Namco
					</h2>
					<p className="text-gray-500 text-sm leading-relaxed">
						Discover the world of fun, innovation, and entertainment.
					</p>
				</div>

				<div className="flex flex-col gap-2">
					{(Object.keys(sections) as Array<keyof typeof sections>).map((key) => {
						const isActive = activeTab === key;
						return (
							<button
								key={key}
								onClick={() => setActiveTab(key)}
								className={cn(
									"flex items-center gap-3 p-3 rounded-xl text-sm font-bold transition-all duration-300 text-left border",
									isActive
										? "bg-orange-50 text-orange-600 border-orange-200 shadow-sm translate-x-1"
										: "bg-transparent border-transparent hover:bg-gray-50 text-gray-500 hover:text-gray-900",
								)}>
								<div
									className={cn(
										"p-1.5 rounded-lg transition-colors",
										isActive
											? "bg-orange-100 text-orange-600"
											: "bg-gray-100 text-gray-500 group-hover:bg-white",
									)}>
									{sections[key].icon}
								</div>
								{sections[key].title}
								{isActive && (
									<ArrowRight className="w-3.5 h-3.5 ml-auto opacity-50" />
								)}
							</button>
						);
					})}
				</div>

				<div className="mt-auto hidden md:block">
					<div className="p-4 rounded-xl bg-gradient-to-br from-orange-50 to-red-50 border border-orange-100/50 relative overflow-hidden">
						<div className="absolute -right-4 -bottom-4 text-orange-100 transform rotate-12">
							<Sparkles className="w-20 h-20" />
						</div>
						<p className="text-[10px] font-bold text-orange-600 uppercase mb-1 tracking-wider relative z-10">
							Did You Know?
						</p>
						<p className="text-xs font-medium text-orange-900 leading-relaxed relative z-10">
							The toy & hobby segment earned about ¥600 billion in sales for FY 2024!
						</p>
					</div>
				</div>
			</div>

			{/* Right Content - Details */}
			<div className="flex-1 flex flex-col bg-white border border-gray-100 rounded-2xl shadow-lg overflow-hidden h-[500px] md:h-auto relative">
				{/* Decorative gradients */}
				<div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-red-600 z-20" />
				<div className="absolute top-0 right-0 w-56 h-56 bg-gradient-to-br from-orange-100/20 to-red-100/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

				<div className="p-6 border-b border-gray-50 bg-white/50 backdrop-blur-sm z-10">
					<h3 className="text-xl font-bold flex items-center gap-3 text-gray-900">
						<div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
							{sections[activeTab].icon}
						</div>
						{sections[activeTab].title}
					</h3>
				</div>

				<div className="p-6 flex-1 overflow-y-auto custom-scrollbar z-10 text-sm">
					{sections[activeTab].content}
				</div>

				<div className="p-4 border-t border-gray-50 bg-gray-50/50 flex gap-3 mt-auto z-10">
					<Button
						onClick={onBack}
						variant="ghost"
						size="sm"
						className="text-gray-500 hover:text-gray-900 hover:bg-gray-100">
						<ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back
					</Button>
					<Button
						onClick={onNext}
						size="sm"
						className="ml-auto bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-md hover:shadow-lg hover:scale-105 transition-all rounded-full px-6 h-9">
						Continue <ArrowRight className="w-3.5 h-3.5 ml-2" />
					</Button>
				</div>
			</div>
		</div>
	);
}
