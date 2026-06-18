import type { ImportAttendanceOptions } from "~/services/attendance.service";

export type AttendanceImportMutationInput = {
	file: File;
	options?: ImportAttendanceOptions;
};

export function buildAttendanceImportMutationInput(
	file: File,
	options?: ImportAttendanceOptions,
): AttendanceImportMutationInput {
	return options ? { file, options } : { file };
}
