import { Prisma } from "../generated/prisma";
import {
	getNestedFields,
	normalizeAndValidateFieldSelection,
} from "../helper/query-builder.helper";

const dmmf = Prisma.dmmf as any;

const getFieldMeta = (modelName: string, fieldName: string) =>
	dmmf.datamodel.models
		.find((model: any) => model.name === modelName)
		?.fields.find((field: any) => field.name === fieldName);

const assertSelectable = (modelName: string, select: any, path = modelName) => {
	for (const [fieldName, value] of Object.entries(select || {})) {
		const meta = getFieldMeta(modelName, fieldName);
		if (!meta) {
			throw new Error(`Invalid select ${path}.${fieldName}`);
		}

		if (value && typeof value === "object" && "select" in value) {
			if (meta.kind !== "object" || !meta.relationName) {
				throw new Error(`Nested select on non-relation ${path}.${fieldName}`);
			}
			assertSelectable(meta.type, (value as any).select, `${path}.${fieldName}`);
		}
	}
};

const cases: Array<{
	label: string;
	fields: string;
	modelName?: string;
	expectErrors?: boolean;
}> = [
	{
		label: "Section stale flattened person name fields",
		fields: "id,name,head.person.firstName,head.person.lastName",
		modelName: "Section",
		expectErrors: true,
	},
	{
		label: "Section JSON owner fields",
		fields: "id,name,head.person.personalInfo.firstName,head.person.personalInfo.lastName",
		modelName: "Section",
	},
	{
		label: "Section no-model fallback",
		fields: "id,name,head.person.firstName,head.person.personalInfo.firstName",
	},
	{
		label: "Person stale flattened fields",
		fields: "id,firstName,lastName",
		modelName: "Person",
		expectErrors: true,
	},
	{
		label: "Person JSON owner fields",
		fields: "id,personalInfo.firstName,contactInfo.email,identification.number",
		modelName: "Person",
	},
	{
		label: "EmployeeBenefit relation JSON owner",
		fields: "id,employee.person.personalInfo.firstName,benefitType.name",
		modelName: "EmployeeBenefit",
	},
	{
		label: "Unknown nested root fallback",
		fields: "id,foo.bar,name",
	},
];

for (const testCase of cases) {
	const select = getNestedFields(testCase.fields, {}, testCase.modelName);
	if (testCase.modelName) {
		assertSelectable(testCase.modelName, select);
		const validation = normalizeAndValidateFieldSelection(
			testCase.modelName,
			testCase.fields,
		);
		const hasErrors = validation.errors.length > 0;
		if (Boolean(testCase.expectErrors) !== hasErrors) {
			throw new Error(
				`${testCase.label} expected errors=${Boolean(testCase.expectErrors)} but got ${JSON.stringify(validation.errors)}`,
			);
		}
	}
	console.log(`ok - ${testCase.label}`);
}
