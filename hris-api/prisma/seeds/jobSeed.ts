import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

const ORG_ID = "69884da971e2dc9d6ac67b59";

interface LevelDefinition {
	name: string;
	rank: number;
	description: string;
	isManager: boolean;
}

interface PositionDefinition {
	title: string;
	code: string;
	description: string;
	minSalary: number;
	maxSalary: number;
	levels: string[]; // Level names to associate
}

interface DepartmentDefinition {
	name: string;
	code: string;
	description: string;
	isHr: boolean;
}

const LEVEL_DEFINITIONS: LevelDefinition[] = [
	{ name: "Entry", rank: 1, description: "Entry-level position for new hires", isManager: false },
	{ name: "Junior", rank: 2, description: "Junior level with 1-2 years experience", isManager: false },
	{ name: "Mid", rank: 3, description: "Mid-level with 3-5 years experience", isManager: true },
	{ name: "Senior", rank: 4, description: "Senior level with 5+ years experience", isManager: true },
	{
		name: "Lead",
		rank: 5,
		description: "Lead position with team leadership responsibilities",
		isManager: true,
	},
	{ name: "Manager", rank: 6, description: "Manager level with department management", isManager: true },
];

const DEPARTMENT_DEFINITIONS: DepartmentDefinition[] = [
	{ name: "Engineering", code: "ENG", description: "Engineering department", isHr: false },
	{ name: "Product", code: "PROD", description: "Product department", isHr: false },
	{ name: "Marketing", code: "MKTG", description: "Marketing department", isHr: false },
	{ name: "Sales", code: "SALES", description: "Sales department", isHr: false },
	{ name: "Human Resources", code: "HR", description: "Human Resources department", isHr: true },
];

const POSITION_DEFINITIONS: PositionDefinition[] = [
	{
		title: "Software Engineer",
		code: "SE",
		description: "Develop and maintain software applications",
		minSalary: 40000,
		maxSalary: 120000,
		levels: ["Entry", "Junior", "Mid", "Senior", "Lead"],
	},
	{
		title: "Frontend Developer",
		code: "FE",
		description: "Build user interfaces and web applications",
		minSalary: 35000,
		maxSalary: 110000,
		levels: ["Junior", "Mid", "Senior", "Lead"],
	},
	{
		title: "Backend Developer",
		code: "BE",
		description: "Design and implement server-side logic and APIs",
		minSalary: 45000,
		maxSalary: 130000,
		levels: ["Junior", "Mid", "Senior", "Lead"],
	},
	{
		title: "DevOps Engineer",
		code: "DEVOPS",
		description: "Manage infrastructure, deployment, and CI/CD pipelines",
		minSalary: 50000,
		maxSalary: 140000,
		levels: ["Mid", "Senior", "Lead"],
	},
	{
		title: "Product Manager",
		code: "PM",
		description: "Define product strategy and roadmap",
		minSalary: 60000,
		maxSalary: 150000,
		levels: ["Mid", "Senior", "Manager"],
	},
	{
		title: "UX Designer",
		code: "UXD",
		description: "Design user experiences and interfaces",
		minSalary: 40000,
		maxSalary: 100000,
		levels: ["Junior", "Mid", "Senior"],
	},
	{
		title: "Data Analyst",
		code: "DA",
		description: "Analyze data and provide insights",
		minSalary: 45000,
		maxSalary: 110000,
		levels: ["Junior", "Mid", "Senior"],
	},
	{
		title: "QA Engineer",
		code: "QA",
		description: "Ensure software quality through testing",
		minSalary: 35000,
		maxSalary: 95000,
		levels: ["Entry", "Junior", "Mid", "Senior"],
	},
];

interface JobDefinition {
	positionCode: string;
	levelName: string;
	type: string;
	location: string;
	description: string;
	tags: Array<{ label: string; variant: string }>;
}

const JOB_DEFINITIONS: JobDefinition[] = [
	{
		positionCode: "SE",
		levelName: "Senior",
		type: "full-time",
		location: "remote",
		description: `We are looking for an experienced Senior Software Engineer to join our growing team.

Key Responsibilities:
 Design and develop scalable software solutions
 Mentor junior developers
 Participate in code reviews and architecture discussions
 Collaborate with cross-functional teams

Requirements:
 5+ years of software development experience
 Strong knowledge of JavaScript/TypeScript
 Experience with React, Node.js, and modern frameworks
 Excellent problem-solving skills
 Good communication and teamwork abilities`,
		tags: [
			{ label: "TypeScript", variant: "default" },
			{ label: "React", variant: "default" },
			{ label: "Node.js", variant: "default" },
		],
	},
	{
		positionCode: "FE",
		levelName: "Mid",
		type: "full-time",
		location: "hybrid",
		description: `Join our team as a Mid-Level Frontend Developer and help build amazing user experiences.

What You'll Do:
 Build responsive web applications
 Implement modern UI/UX designs
 Optimize application performance
 Work closely with designers and backend developers

What We're Looking For:
 3-5 years of frontend development experience
 Proficiency in React and modern CSS
 Understanding of web performance optimization
 Experience with state management (Redux, Zustand)`,
		tags: [
			{ label: "React", variant: "default" },
			{ label: "CSS", variant: "default" },
			{ label: "JavaScript", variant: "default" },
		],
	},
	{
		positionCode: "BE",
		levelName: "Senior",
		type: "full-time",
		location: "onsite",
		description: `We're seeking a Senior Backend Developer to architect and build robust server-side systems.

Responsibilities:
 Design and implement RESTful APIs
 Optimize database queries and performance
 Ensure security and data protection
 Deploy and maintain cloud infrastructure

Requirements:
 5+ years backend development experience
 Strong knowledge of Node.js, Python, or Go
 Experience with databases (PostgreSQL, MongoDB)
 Cloud platform experience (AWS, GCP, Azure)`,
		tags: [
			{ label: "Node.js", variant: "default" },
			{ label: "PostgreSQL", variant: "default" },
			{ label: "AWS", variant: "default" },
		],
	},
	{
		positionCode: "DEVOPS",
		levelName: "Lead",
		type: "full-time",
		location: "remote",
		description: `Lead our DevOps initiatives and build scalable infrastructure.

Key Focus Areas:
 Design and maintain CI/CD pipelines
 Manage Kubernetes clusters
 Implement monitoring and alerting systems
 Lead infrastructure automation efforts

What You Bring:
 7+ years of DevOps/SRE experience
 Expert knowledge of Kubernetes and Docker
 Proficiency in Infrastructure as Code (Terraform, CloudFormation)
 Strong scripting skills (Bash, Python)`,
		tags: [
			{ label: "Kubernetes", variant: "default" },
			{ label: "AWS", variant: "default" },
			{ label: "Terraform", variant: "default" },
		],
	},
	{
		positionCode: "PM",
		levelName: "Senior",
		type: "full-time",
		location: "hybrid",
		description: `Drive product strategy and execution as a Senior Product Manager.

Your Role:
 Define product vision and roadmap
 Conduct market research and user interviews
 Collaborate with engineering and design teams
 Track metrics and iterate on features

Qualifications:
 5+ years of product management experience
 Strong analytical and strategic thinking skills
 Excellent stakeholder management
 Experience with agile methodologies`,
		tags: [
			{ label: "Product Strategy", variant: "default" },
			{ label: "Agile", variant: "default" },
			{ label: "Analytics", variant: "default" },
		],
	},
	{
		positionCode: "UXD",
		levelName: "Mid",
		type: "full-time",
		location: "hybrid",
		description: `Create delightful user experiences as a UX Designer.

What You'll Do:
 Conduct user research and usability testing
 Create wireframes, prototypes, and mockups
 Collaborate with developers to implement designs
 Maintain design systems and guidelines

Requirements:
 3-5 years of UX design experience
 Proficiency in Figma or Sketch
 Understanding of design systems
 Portfolio demonstrating UX process`,
		tags: [
			{ label: "Figma", variant: "default" },
			{ label: "User Research", variant: "default" },
			{ label: "Prototyping", variant: "default" },
		],
	},
	{
		positionCode: "DA",
		levelName: "Senior",
		type: "full-time",
		location: "remote",
		description: `Uncover insights as a Senior Data Analyst.

Responsibilities:
 Analyze complex datasets
 Build dashboards and reports
 Provide data-driven recommendations
 Collaborate with stakeholders across the organization

Skills Needed:
 5+ years of data analysis experience
 Expert SQL skills
 Proficiency in Python or R
 Experience with BI tools (Tableau, Power BI)`,
		tags: [
			{ label: "SQL", variant: "default" },
			{ label: "Python", variant: "default" },
			{ label: "Tableau", variant: "default" },
		],
	},
	{
		positionCode: "QA",
		levelName: "Mid",
		type: "full-time",
		location: "onsite",
		description: `Ensure quality as a QA Engineer.

Your Mission:
 Design and execute test plans
 Write automated tests
 Identify and document bugs
 Collaborate with developers on quality improvements

Requirements:
 3-5 years of QA experience
 Experience with test automation frameworks
 Knowledge of CI/CD processes
 Strong attention to detail`,
		tags: [
			{ label: "Testing", variant: "default" },
			{ label: "Automation", variant: "default" },
			{ label: "Selenium", variant: "default" },
		],
	},
	{
		positionCode: "SE",
		levelName: "Junior",
		type: "full-time",
		location: "onsite",
		description: `Start your career as a Junior Software Engineer.

What You'll Learn:
 Write clean, maintainable code
 Participate in code reviews
 Work on real-world projects
 Grow your technical skills

We're Looking For:
 1-2 years of programming experience
 Knowledge of at least one programming language
 Passion for learning and growth
 Good communication skills`,
		tags: [
			{ label: "JavaScript", variant: "default" },
			{ label: "Git", variant: "default" },
			{ label: "Learning", variant: "default" },
		],
	},
	{
		positionCode: "FE",
		levelName: "Senior",
		type: "contract",
		location: "remote",
		description: `Contract opportunity for a Senior Frontend Developer.

Project Details:
 6-month contract with possibility of extension
 Build a new customer-facing web application
 Work with modern tech stack
 Flexible hours, remote work

Requirements:
 5+ years frontend development
 Expert React skills
 Experience with Next.js
 Strong portfolio`,
		tags: [
			{ label: "React", variant: "default" },
			{ label: "Next.js", variant: "default" },
			{ label: "Contract", variant: "secondary" },
		],
	},
];

async function ensureLevels(): Promise<Map<string, string>> {
	console.log("\n=== Creating/Finding Levels ===");
	const levelMap = new Map<string, string>();

	for (const levelDef of LEVEL_DEFINITIONS) {
		const level = await prisma.level.upsert({
			where: {
				organizationId_name: {
					organizationId: ORG_ID,
					name: levelDef.name,
				},
			},
			update: {
				rank: levelDef.rank,
				description: levelDef.description,
				isManager: levelDef.isManager,
			},
			create: {
				organizationId: ORG_ID,
				name: levelDef.name,
				rank: levelDef.rank,
				description: levelDef.description,
				isManager: levelDef.isManager,
				isActive: true,
				isDeleted: false,
			},
		});
		levelMap.set(levelDef.name, level.id);
		console.log(` Level: ${levelDef.name} (${level.id})`);
	}

	return levelMap;
}

async function ensureDepartments(): Promise<Map<string, string>> {
	console.log("\n=== Creating/Finding Departments ===");
	const deptMap = new Map<string, string>();

	for (const deptDef of DEPARTMENT_DEFINITIONS) {
		const dept = await prisma.department.upsert({
			where: {
				organizationId_code: {
					organizationId: ORG_ID,
					code: deptDef.code,
				},
			},
			update: {
				description: deptDef.description,
				isHr: deptDef.isHr,
			},
			create: {
				organizationId: ORG_ID,
				name: deptDef.name,
				code: deptDef.code,
				description: deptDef.description,
				isHr: deptDef.isHr,
				isActive: true,
				isDeleted: false,
			},
		});
		deptMap.set(deptDef.code, dept.id);
		console.log(` Department: ${deptDef.name} (${dept.id})`);
	}

	return deptMap;
}

async function ensurePositions(deptMap: Map<string, string>): Promise<Map<string, string>> {
	console.log("\n=== Creating/Finding Positions ===");
	const positionMap = new Map<string, string>();

	// Use Engineering department as default
	const defaultDeptId = deptMap.get("ENG")!;

	for (const posDef of POSITION_DEFINITIONS) {
		const position = await prisma.position.upsert({
			where: {
				organizationId_code: {
					organizationId: ORG_ID,
					code: posDef.code,
				},
			},
			update: {},
			create: {
				organizationId: ORG_ID,
				title: posDef.title,
				code: posDef.code,
				description: posDef.description,
				departmentId: defaultDeptId,
				minSalary: posDef.minSalary,
				maxSalary: posDef.maxSalary,
				isActive: true,
				isDeleted: false,
				isOffer: true,
			},
		});
		positionMap.set(posDef.code, position.id);
		console.log(` Position: ${posDef.title} (${position.id})`);
	}

	return positionMap;
}

async function ensurePositionLevels(
	positionMap: Map<string, string>,
	levelMap: Map<string, string>,
): Promise<Map<string, string>> {
	console.log("\n=== Creating PositionLevel Junctions ===");
	const positionLevelMap = new Map<string, string>();

	for (const posDef of POSITION_DEFINITIONS) {
		const positionId = positionMap.get(posDef.code)!;

		for (const levelName of posDef.levels) {
			const levelId = levelMap.get(levelName)!;
			const key = `${posDef.code}-${levelName}`;

			const positionLevel = await prisma.positionLevel.upsert({
				where: {
					positionId_levelId: {
						positionId,
						levelId,
					},
				},
				update: {},
				create: {
					positionId,
					levelId,
				},
			});

			positionLevelMap.set(key, positionLevel.id);
			console.log(` PositionLevel: ${posDef.title} - ${levelName} (${positionLevel.id})`);
		}
	}

	return positionLevelMap;
}

async function seedJobs(positionLevelMap: Map<string, string>) {
	console.log("\n=== Seeding Jobs ===");

	for (const jobDef of JOB_DEFINITIONS) {
		const key = `${jobDef.positionCode}-${jobDef.levelName}`;
		const positionLevelId = positionLevelMap.get(key);

		if (!positionLevelId) {
			console.log(` Skipping job - PositionLevel not found: ${key}`);
			continue;
		}

		// Check if job already exists for this positionLevel
		const existing = await prisma.job.findFirst({
			where: {
				positionLevelId,
				isDeleted: false,
			},
		});

		if (existing) {
			console.log(` Job already exists for ${key}, skipping`);
			continue;
		}

		const job = await prisma.job.create({
			data: {
				positionLevelId,
				type: jobDef.type,
				location: jobDef.location,
				description: jobDef.description,
				tags: jobDef.tags,
				isDeleted: false,
			},
		});

		console.log(` Created job for ${key} (${job.id})`);
	}
}

async function main() {
	console.log(" Starting Job Seeding Script");
	console.log(`Organization ID: ${ORG_ID}`);

	try {
		const levelMap = await ensureLevels();
		const deptMap = await ensureDepartments();
		const positionMap = await ensurePositions(deptMap);
		const positionLevelMap = await ensurePositionLevels(positionMap, levelMap);
		await seedJobs(positionLevelMap);

		console.log("\n Job seeding completed successfully!");
	} catch (error) {
		console.error("\n Error during seeding:", error);
		throw error;
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
