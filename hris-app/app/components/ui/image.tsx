import { cn } from "@/lib/utils";
import type React from "react";

interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
	aspectRatio?: "auto" | "square" | "video" | "portrait" | "wide";
	width?: number;
	height?: number;
	className?: string;
}

function Image({
	src,
	alt = "",
	aspectRatio = "auto",
	width,
	height,
	className,
	...props
}: ImageProps) {
	const aspectRatioClasses = {
		auto: "",
		square: "aspect-square",
		video: "aspect-video",
		portrait: "aspect-[3/4]",
		wide: "aspect-[16/9]",
	};

	return (
		<img
			src={src || "/placeholder.svg"}
			alt={alt}
			width={width}
			height={height}
			className={cn("object-contain", aspectRatioClasses[aspectRatio], className)}
			{...props}
		/>
	);
}

export { Image };
