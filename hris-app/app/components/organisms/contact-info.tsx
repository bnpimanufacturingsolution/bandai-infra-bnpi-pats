import { ContactInfoItem } from "@/components/molecules/contact-info-item";

export function ContactInfo() {
	const contactItems = [
		{
			title: "Office Location",
			details: ["123 Developer Street, Tech City"],
		},
		{
			title: "Contact Information",
			details: ["Email: info@reacttemplate.com", "Phone: +1 (555) 123-4567"],
		},
		{
			title: "Business Hours",
			details: [
				"Monday - Friday: 9:00 AM - 5:00 PM",
				"Saturday: 10:00 AM - 2:00 PM",
				"Sunday: Closed",
			],
		},
	];

	return (
		<div className="flex flex-col justify-center space-y-6">
			{contactItems.map((item, index) => (
				<ContactInfoItem key={index} title={item.title} details={item.details} />
			))}
		</div>
	);
}
