interface ContactInfoItemProps {
	title: string;
	details: string[];
}

export function ContactInfoItem({ title, details }: ContactInfoItemProps) {
	return (
		<div className="space-y-2">
			<h3 className="text-xl font-bold">{title}</h3>
			{details.map((detail, index) => (
				<p key={index} className="text-muted-foreground">
					{detail}
				</p>
			))}
		</div>
	);
}
