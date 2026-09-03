import {
	disconnectGeneralEmployeeSeederPrisma,
	seedGeneralEmployees,
	seedGeneralEmployeesWithConfig,
} from "./generalEmployeeSeeder.shared";

export { seedGeneralEmployees, seedGeneralEmployeesWithConfig };

if (require.main === module) {
	seedGeneralEmployees()
		.catch((error) => {
			console.error("General employee seeding failed:", error);
			process.exitCode = 1;
		})
		.finally(async () => {
			await disconnectGeneralEmployeeSeederPrisma();
		});
}
