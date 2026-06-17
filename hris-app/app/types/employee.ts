// Employee-related types
export interface Employee {
	id: string;
	name: string;
	email: string;
	phone?: string;
	position: string;
	department: string;
	location?: string;
	employmentHireDate: string;
	status: "active" | "inactive" | "on_leave";
	avatar?: string;
	manager?: string;
	team?: string;
	salary?: number;
	employeeId: string;
	dateOfBirth?: string;
	emergencyContact?: {
		name: string;
		phone: string;
		relationship: string;
	};
}

export interface EmployeeProfile extends Employee {
	skills: string[];
	languages: string[];
	education: Education[];
	experience: WorkExperience[];
	documents: Document[];
}

export interface Education {
	id: string;
	institution: string;
	degree: string;
	field: string;
	startDate: string;
	endDate?: string;
	gpa?: number;
}

export interface WorkExperience {
	id: string;
	company: string;
	position: string;
	startDate: string;
	endDate?: string;
	description: string;
}

export interface Document {
	id: string;
	name: string;
	number: string;
	type: string;
	url: string;
	uploadDate: string;
	expiryDate?: string;
}

export interface EmployeeSearchFilters {
	department?: string;
	position?: string;
	status?: string;
	location?: string;
	search?: string;
}
