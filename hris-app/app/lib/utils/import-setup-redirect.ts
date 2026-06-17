const EMPLOYEE_IMPORT_RETURN_ACTION = "import-employees";
const EMPLOYEE_FORM_RETURN_ACTION = "employee-form";
const EMPLOYEE_IMPORT_RETURN_STEP = "3";
const EMPLOYEE_IMPORT_RETURN_IMPORT_STEP = "preview";

export interface BuildSetupCreateHrefOptions {
	basePath: string;
	prefillName?: string;
	prefillCode?: string;
	returnTo?: string;
}

export function buildEmployeeImportReturnTo(): string {
	const params = new URLSearchParams({
		action: EMPLOYEE_IMPORT_RETURN_ACTION,
		step: EMPLOYEE_IMPORT_RETURN_STEP,
		importStep: EMPLOYEE_IMPORT_RETURN_IMPORT_STEP,
	});

	return `/admin/configuration/migration?${params.toString()}`;
}

export function buildSetupCreateHref({
	basePath,
	prefillName,
	prefillCode,
	returnTo = buildEmployeeImportReturnTo(),
}: BuildSetupCreateHrefOptions): string {
	const params = new URLSearchParams({
		action: "create",
		returnTo,
		returnAction: EMPLOYEE_IMPORT_RETURN_ACTION,
		returnStep: EMPLOYEE_IMPORT_RETURN_STEP,
	});

	if (prefillName?.trim()) {
		params.set("prefillName", prefillName.trim());
	}

	if (prefillCode?.trim()) {
		params.set("prefillCode", prefillCode.trim());
	}

	return `${basePath}?${params.toString()}`;
}

export function getSetupReturnTo(searchParams: URLSearchParams): string | null {
	const returnTo = String(searchParams.get("returnTo") || "").trim();
	return returnTo || null;
}

export function isEmployeeImportReturn(searchParams: URLSearchParams): boolean {
	return searchParams.get("returnAction") === EMPLOYEE_IMPORT_RETURN_ACTION;
}

export function isEmployeeFormReturn(searchParams: URLSearchParams): boolean {
	return searchParams.get("returnAction") === EMPLOYEE_FORM_RETURN_ACTION;
}

export function buildEmployeeFormReturnTo(pathname: string, searchParams: URLSearchParams): string {
	const params = new URLSearchParams(searchParams);
	return params.toString() ? `${pathname}?${params.toString()}` : pathname;
}

export function buildEmployeeFormCreateHref(options: {
	basePath: string;
	returnTo: string;
	prefillName?: string;
	prefillCode?: string;
}) {
	const params = new URLSearchParams({
		action: "create",
		returnTo: options.returnTo,
		returnAction: EMPLOYEE_FORM_RETURN_ACTION,
	});

	if (options.prefillName?.trim()) {
		params.set("prefillName", options.prefillName.trim());
	}

	if (options.prefillCode?.trim()) {
		params.set("prefillCode", options.prefillCode.trim());
	}

	return `${options.basePath}?${params.toString()}`;
}

export function appendReturnToParam(returnTo: string, key: string, value: string): string {
	const [pathname, queryString = ""] = returnTo.split("?");
	const params = new URLSearchParams(queryString);
	params.set(key, value);
	const nextQuery = params.toString();
	return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}
