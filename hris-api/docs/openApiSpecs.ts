import swaggerJSDoc from "swagger-jsdoc";
import options from "./openApiOptions.json";

export default function () {
	const spec = swaggerJSDoc(options as any) as { paths?: Record<string, unknown> };
	try {
		const numPaths = spec?.paths ? Object.keys(spec.paths).length : 0;
	} catch {}
	return spec as any;
}
