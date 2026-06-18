import { SectionHeader } from "@/components/molecules/shared/SectionHeader";
import { ContactForm } from "@/components/organisms/contact-form";
import { ContactInfo } from "@/components/organisms/contact-info";

export function ContactTemplate() {
	return (
		<section id="contact" className="py-16">
			<div className="container px-4 md:px-6 max-w-7xl mx-auto">
				<SectionHeader
					title="Get in Touch"
					description="Have questions? Our team is here to help you with any inquiries."
				/>

				<div className="grid gap-8 md:grid-cols-2">
					<ContactForm />
					<ContactInfo />
				</div>
			</div>
		</section>
	);
}
