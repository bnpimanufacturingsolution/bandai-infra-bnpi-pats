import { Globe, Sparkles, Zap } from "lucide-react";

export function LoginHero() {
	return (
		<div className="hidden lg:flex lg:w-[55%] relative items-center justify-center overflow-hidden bg-gradient-to-br from-orange-50 via-white to-red-50">
			{/* Main Content Container */}
			<div className="relative z-10 w-full h-full max-w-7xl mx-auto p-12 flex flex-col justify-between">
				{/* Top Right Decorative Element */}
				<div className="self-end animate-in fade-in slide-in-from-top-8 duration-1000 delay-100">
					<div className="flex items-center gap-2 px-4 py-2 bg-white/60 backdrop-blur-md rounded-full border border-gray-200/50 shadow-sm">
						<Globe className="w-4 h-4 text-orange-600" />
						<span className="text-xs font-medium text-gray-600">
							Global Entertainment
						</span>
					</div>
				</div>

				{/* Center Content Area */}
				<div className="flex-1 flex flex-col justify-center items-start lg:pl-12 xl:pl-20 max-w-2xl">
					<div className="inline-flex items-center gap-2 px-3 py-1 bg-white/80 border border-orange-100 text-orange-600 rounded-full text-[10px] font-bold tracking-wider uppercase mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 shadow-sm">
						<Sparkles className="w-3 h-3" />
						Fun for All into the Future
					</div>

					{/* Refined Headline - Fits Width Better */}
					<h2 className="text-4xl xl:text-5xl font-black text-gray-900 leading-[1.15] tracking-tight mb-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 drop-shadow-sm max-w-lg">
						Adventure Awaits. <br className="hidden xl:block" />
						<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-600">
							Conquer It.
						</span>
					</h2>

					<p className="text-gray-600 text-lg leading-relaxed max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700 delay-400 font-medium">
						Join a world where creativity knows no bounds. Your journey with Bandai
						Namco starts here.
					</p>

					{/* Feature Pills */}
					<div className="flex flex-wrap gap-3 mt-8 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-500">
						<div className="px-4 py-2 bg-white/60 backdrop-blur-sm border border-gray-200/50 rounded-lg text-sm text-gray-700 font-medium hover:bg-white hover:border-orange-200 transition-colors shadow-sm">
							🚀 Innovation
						</div>
						<div className="px-4 py-2 bg-white/60 backdrop-blur-sm border border-gray-200/50 rounded-lg text-sm text-gray-700 font-medium hover:bg-white hover:border-orange-200 transition-colors shadow-sm">
							🎨 Creativity
						</div>
						<div className="px-4 py-2 bg-white/60 backdrop-blur-sm border border-gray-200/50 rounded-lg text-sm text-gray-700 font-medium hover:bg-white hover:border-orange-200 transition-colors shadow-sm">
							🤝 Community
						</div>
					</div>
				</div>

				{/* Bottom Right Floating Card */}
				<div className="self-end mt-auto xl:mr-12 animate-in fade-in zoom-in-95 duration-1000 delay-700">
					<div className="bg-white/80 backdrop-blur-md border border-white/60 p-5 rounded-2xl w-64 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
						<div className="absolute inset-0 bg-gradient-to-br from-orange-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
						<div className="flex items-center gap-4 mb-3">
							<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/20 border border-white/20">
								<Zap className="w-5 h-5 fill-current" />
							</div>
							<div>
								<h4 className="text-gray-900 font-bold text-sm">Employee Portal</h4>
								<p className="text-gray-500 text-[10px]">Access your dashboard</p>
							</div>
						</div>
						<div className="flex items-center justify-between text-[10px] text-gray-400 pt-3 border-t border-gray-100">
							<span>System Status</span>
							<span className="flex items-center gap-1.5 text-green-500 font-medium">
								<span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></span>
								Online
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
