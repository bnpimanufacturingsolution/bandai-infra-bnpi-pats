import { useState } from "react";
import { ShoppingCart, Heart, Tag, Search, Filter, ArrowRight } from "lucide-react";

// Mock Data
const MOCK_PRODUCTS = [
	{
		id: 1,
		name: "Bandai RG 1/144 Hi-Nu Gundam",
		description:
			"Real Grade implementation of the popular mobile suit from Beltorchika's Children.",
		price: 3200,
		originalPrice: 4500,
		image: "https://placehold.co/400x400/e60000/ffffff?text=RG+Hi-Nu",
		category: "Model Kits",
		badge: "Best Seller",
		rating: 4.9,
		reviews: 128,
	},
	{
		id: 2,
		name: "Tamagotchi Uni - Pink",
		description:
			"The newest Tamagotchi with Wi-Fi allows you to connect with friends globally.",
		price: 4500,
		originalPrice: 5200,
		image: "https://placehold.co/400x400/ff69b4/ffffff?text=Tamagotchi",
		category: "Digital Toys",
		badge: "New",
		rating: 4.7,
		reviews: 85,
	},
	{
		id: 3,
		name: "Demon Slayer DX Nichirin Sword",
		description: "Tanjiro Kamado's sword with authentic sound effects and voice lines.",
		price: 2800,
		originalPrice: 3500,
		image: "https://placehold.co/400x400/000000/ffffff?text=Nichirin+Sword",
		category: "Toys",
		badge: "Sale",
		rating: 4.5,
		reviews: 210,
	},
	{
		id: 4,
		name: "One Piece TCG: Awakening of the New Era",
		description: "Booster box containing 24 packs. Features Gear 5 Luffy.",
		price: 3800,
		originalPrice: 3800,
		image: "https://placehold.co/400x400/60a5fa/ffffff?text=OP+TCG",
		category: "Card Games",
		badge: "",
		rating: 5.0,
		reviews: 342,
	},
	{
		id: 5,
		name: "Dragon Ball Super: Super Hero - Gamble",
		description: "SHFiguarts action figure with premium articulation.",
		price: 3000,
		originalPrice: 3200,
		image: "https://placehold.co/400x400/fb923c/ffffff?text=SHF+Gambia",
		category: "Figures",
		badge: "Limited",
		rating: 4.8,
		reviews: 56,
	},
	{
		id: 6,
		name: "Gundam Breaker 4 - PS5",
		description: "Break, build, and battle in the newest installment of the series.",
		price: 2500,
		originalPrice: 2500,
		image: "https://placehold.co/400x400/2563eb/ffffff?text=Gundam+Breaker",
		category: "Video Games",
		badge: "Pre-order",
		rating: 0,
		reviews: 0,
	},
];

const CATEGORIES = [
	"All",
	"Model Kits",
	"Digital Toys",
	"Toys",
	"Card Games",
	"Figures",
	"Video Games",
];

export default function EmployeePurchaseProgram() {
	const [selectedCategory, setSelectedCategory] = useState("All");
	const [hoveredProduct, setHoveredProduct] = useState<number | null>(null);

	const filteredProducts =
		selectedCategory === "All"
			? MOCK_PRODUCTS
			: MOCK_PRODUCTS.filter((p) => p.category === selectedCategory);

	return (
		<div className="min-h-screen bg-neutral-50/50 pb-20">
			{/* Hero Header */}
			<div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 to-red-700 p-8 md:p-12 text-white shadow-lg mb-8 mt-6">
				<div className="relative z-10 max-w-2xl">
					<div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur-sm mb-4">
						<Tag className="h-4 w-4" />
						<span>Employee Exclusive Benefits</span>
					</div>
					<h1 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">
						Employee Purchase Program
					</h1>
					<p className="text-red-100 text-lg md:text-xl mb-8 leading-relaxed max-w-xl">
						Exclusive discounts on Bandai Namco products for our valued team members.
						Enjoy up to 40% off on selected items.
					</p>
					<button className="group flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-red-600 transition-all hover:bg-neutral-100 hover:shadow-lg active:scale-95">
						View Special Offers
						<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
					</button>
				</div>

				{/* Decorative Elements */}
				<div className="absolute inset-0 h-full w-full opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
				<div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-white blur-3xl opacity-20 hover:opacity-30 transition-opacity"></div>
				<div className="absolute -top-24 right-1/4 h-64 w-64 rounded-full bg-yellow-400 blur-3xl opacity-20 mix-blend-overlay"></div>
			</div>

			{/* Main Content */}
			<div className="">
				{/* Controls */}
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
					<div className="flex items-center gap-2 overflow-x-auto p-1 pb-2 md:p-1 md:pb-1 no-scrollbar mask-gradient-right">
						{CATEGORIES.map((cat) => (
							<button
								key={cat}
								onClick={() => setSelectedCategory(cat)}
								className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all ${
									selectedCategory === cat
										? "bg-neutral-900 text-white shadow-md ring-2 ring-neutral-900 ring-offset-2"
										: "bg-white text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
								}`}>
								{cat}
							</button>
						))}
					</div>

					<div className="flex items-center gap-2 bg-white rounded-full p-1.5 shadow-sm border border-neutral-200">
						<div className="pl-3">
							<Search className="h-4 w-4 text-neutral-400" />
						</div>
						<input
							type="text"
							placeholder="Search products..."
							className="bg-transparent border-none focus:ring-0 text-sm w-40 md:w-64 placeholder:text-neutral-400"
						/>
						<button className="p-2 hover:bg-neutral-100 rounded-full text-neutral-500 transition-colors">
							<Filter className="h-4 w-4" />
						</button>
					</div>
				</div>

				{/* Product Grid */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in-up">
					{filteredProducts.map((product) => (
						<div
							key={product.id}
							onMouseEnter={() => setHoveredProduct(product.id)}
							onMouseLeave={() => setHoveredProduct(null)}
							className="group relative bg-white rounded-2xl overflow-hidden border border-neutral-100 shadow-sm hover:shadow-xl hover:border-red-100 transition-all duration-300 flex flex-col h-full transform hover:-translate-y-1">
							{/* Badge */}
							{product.badge && (
								<div className="absolute top-3 left-3 z-10">
									<span
										className={`px-2.5 py-1 text-xs font-bold rounded-full backdrop-blur-md shadow-sm border ${
											product.badge === "Sale"
												? "bg-red-500/90 text-white border-red-400"
												: product.badge === "New"
													? "bg-blue-500/90 text-white border-blue-400"
													: "bg-white/90 text-neutral-800 border-white"
										}`}>
										{product.badge}
									</span>
								</div>
							)}

							{/* Wishlist Button */}
							<button className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/80 backdrop-blur-sm text-neutral-400 hover:text-red-500 hover:bg-white transition-all shadow-sm opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 duration-300">
								<Heart className="h-4 w-4" />
							</button>

							{/* Product Image */}
							<div className="aspect-square w-full overflow-hidden bg-neutral-50 relative">
								<img
									src={product.image}
									alt={product.name}
									className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-110"
								/>
								{/* Overlay on hover */}
								<div
									className={`absolute inset-0 bg-black/5 transition-opacity duration-300 ${hoveredProduct === product.id ? "opacity-100" : "opacity-0"}`}
								/>
							</div>

							{/* Product Info */}
							<div className="p-5 flex-1 flex flex-col">
								<div className="text-xs text-neutral-500 font-medium mb-1">
									{product.category}
								</div>
								<h3 className="font-bold text-neutral-900 leading-tight mb-2 group-hover:text-red-600 transition-colors line-clamp-2">
									{product.name}
								</h3>

								{/* <div className="flex items-center gap-1 mb-4">
									{[1, 2, 3, 4, 5].map((star) => (
										<svg
											key={star}
											className={`w-3.5 h-3.5 ${star <= Math.round(product.rating) ? "text-yellow-400" : "text-neutral-200"}`}
											aria-hidden="true"
											xmlns="http://www.w3.org/2000/svg"
											fill="currentColor"
											viewBox="0 0 22 20">
											<path d="M20.924 7.625a1.523 1.523 0 0 0-1.238-1.044l-5.051-.734-2.259-4.577a1.534 1.534 0 0 0-2.752 0L7.365 5.847l-5.051.734A1.535 1.535 0 0 0 1.463 9.2l3.656 3.563-.863 5.031a1.532 1.532 0 0 0 2.226 1.616L11 17.033l4.518 2.375a1.534 1.534 0 0 0 2.226-1.617l-.863-5.03L20.537 9.2a1.523 1.523 0 0 0 .387-1.575Z" />
										</svg>
									))}
									<span className="text-xs text-neutral-400 ml-1">
										({product.reviews})
									</span>
								</div> */}

								<div className="mt-auto flex items-end justify-between">
									<div>
										<div className="text-xs text-neutral-400 line-through">
											₱{product.originalPrice.toLocaleString()}
										</div>
										<div className="text-lg font-bold text-red-600">
											₱{product.price.toLocaleString()}
										</div>
									</div>
									<button className="rounded-full bg-neutral-900 p-2.5 text-white shadow-md hover:bg-neutral-800 hover:scale-105 active:scale-95 transition-all">
										<ShoppingCart className="h-4 w-4" />
									</button>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
