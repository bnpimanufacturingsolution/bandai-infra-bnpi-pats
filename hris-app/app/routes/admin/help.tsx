import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { HelpCircle, Book, MessageCircle, Phone, Mail, ExternalLink } from "lucide-react";

export default function HelpPage() {
	const faqs = [
		{
			question: "How do I add a new employee?",
			answer: "Go to HR Admin > Employees and click the 'Add Employee' button. Fill in the required information and save.",
		},
		{
			question: "How do I approve leave requests?",
			answer: "Navigate to HR Admin > Approvals to view pending leave requests. Click on a request to review and approve or reject it.",
		},
		{
			question: "How do I generate reports?",
			answer: "Go to HR Admin > Reports and select the type of report you want to generate. Choose your date range and export options.",
		},
		{
			question: "How do I update employee information?",
			answer: "Find the employee in the Employees list, click on their name to open their profile, then click 'Edit' to make changes.",
		},
		{
			question: "How do I manage departments?",
			answer: "Go to Admin > Configuration > Departments to add, edit, or remove departments from your organization.",
		},
	];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Help & Support</h1>
					<p className="text-gray-600">Get help and support for the HR system</p>
				</div>
			</div>

			{/* Quick Actions */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Book className="h-5 w-5" />
							Documentation
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-600 mb-4">
							Comprehensive guides and tutorials for using the HR system.
						</p>
						<Button variant="outline" className="w-full">
							<ExternalLink className="h-4 w-4 mr-2" />
							View Documentation
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<MessageCircle className="h-5 w-5" />
							Live Chat
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-600 mb-4">
							Chat with our support team for immediate assistance.
						</p>
						<Button variant="outline" className="w-full">
							<MessageCircle className="h-4 w-4 mr-2" />
							Start Chat
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Phone className="h-5 w-5" />
							Contact Support
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-gray-600 mb-4">
							Get in touch with our support team via phone or email.
						</p>
						<Button variant="outline" className="w-full">
							<Mail className="h-4 w-4 mr-2" />
							Contact Us
						</Button>
					</CardContent>
				</Card>
			</div>

			{/* FAQ Section */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<HelpCircle className="h-5 w-5" />
						Frequently Asked Questions
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{faqs.map((faq, index) => (
							<div key={index} className="border-b pb-4 last:border-b-0">
								<h4 className="font-medium text-gray-900 mb-2">{faq.question}</h4>
								<p className="text-sm text-gray-600">{faq.answer}</p>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Contact Information */}
			<Card>
				<CardHeader>
					<CardTitle>Contact Information</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<h4 className="font-medium text-gray-900 mb-2">Support Hours</h4>
							<p className="text-sm text-gray-600">
								Monday - Friday: 8:00 AM - 6:00 PM
								<br />
								Saturday: 9:00 AM - 2:00 PM
								<br />
								Sunday: Closed
							</p>
						</div>
						<div>
							<h4 className="font-medium text-gray-900 mb-2">Contact Details</h4>
							<p className="text-sm text-gray-600">
								Phone: +63 2 1234 5678
								<br />
								Email: support@company.com
								<br />
								Address: 123 Business St, Manila, Philippines
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
