import { PrismaClient } from "../generated/prisma";
import { hikvisionFetch } from "../lib/hikvision-client";
import {
	buildHikvisionLogSearchXml,
	parseHikvisionLogSearchResponse,
} from "../helper/hikvision-event-contract.helper";

const url = process.env.FORCE_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: url || undefined } } });

async function main() {
	const device = await prisma.device.findFirst({
		where: { isDeleted: false, address: "192.168.254.189" },
		select: { id: true },
	});
	if (!device) throw new Error("no device");

	const metas = [
		"log.hikvision.com/Information",
		"log.hikvision.com/Information/addUserInfo",
		"log.hikvision.com/Information/addFpByEmployeeNo",
		"log.hikvision.com/Information/addFpByCardNo",
		"log.hikvision.com/Information/addCardInfo",
		"log.std-cgi.com",
	];

	for (const metaId of metas) {
		const xml = buildHikvisionLogSearchXml({
			searchId: `meta-test-${Date.now()}`,
			startTime: "2026-07-13T00:00:00+08:00",
			endTime: "2026-07-13T23:59:59+08:00",
			maxResults: 5,
			searchResultPosition: 0,
			metaId,
		});
		try {
			const response = await hikvisionFetch("/ISAPI/ContentMgmt/logSearch", {
				method: "POST",
				deviceId: device.id,
				prisma,
				timeoutMs: 15000,
				ensureJsonFormat: false,
				rawResponse: true,
				headers: {
					Accept: "application/xml, text/xml, */*",
					"Content-Type": "application/xml; charset=UTF-8",
				},
				body: xml,
			});
			const parsed = parseHikvisionLogSearchResponse(String((response as any)?.raw || ""));
			const sampleMeta = parsed.rows[0]?.metaId || parsed.rows[0]?.minorType || "";
			console.log(
				JSON.stringify({
					metaId,
					ok: true,
					totalMatches: parsed.totalMatches ?? null,
					rows: parsed.rows.length,
					status: parsed.responseStatus || null,
					sample: sampleMeta,
				}),
			);
		} catch (e: any) {
			console.log(
				JSON.stringify({
					metaId,
					ok: false,
					err: String(e?.message || e).slice(0, 180),
				}),
			);
		}
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
