export type AcsSerialDedupePrisma = {
	deviceEvent: {
		findMany: (args: any) => Promise<any[]>;
	};
};

export type FindExistingDeviceEventByAcsSerialParams = {
	organizationId: string;
	deviceId: string;
	serialNo: string;
	eventTime: Date;
};

const ACS_SERIAL_LOOKUP_TAKE = 2000;

export const extractAcsSerialFromPayload = (payload: unknown): string => {
	const record =
		payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
	const candidate =
		record.serialNo ||
		record.AcsEventInfo?.serialNo ||
		record.EventNotificationAlert?.AccessControllerEvent?.serialNo ||
		record.AccessControllerEvent?.serialNo;
	return String(candidate ?? "").trim();
};

export const buildAcsSerialLookupWindow = (eventTime: Date) => {
	const start = new Date(eventTime);
	start.setUTCHours(0, 0, 0, 0);
	start.setUTCDate(start.getUTCDate() - 1);
	const end = new Date(eventTime);
	end.setUTCHours(23, 59, 59, 999);
	end.setUTCDate(end.getUTCDate() + 1);
	return { start, end };
};

/**
 * Collapse identity_repost / empty-then-filled callbacks onto the original ACS serial.
 * Same device + eventTime ±1 day. Do not filter by source or employeeNo.
 * Prefer oldest receivedAt so the first empty SYNC_SIGNAL row stays canonical.
 */
export const findExistingDeviceEventByAcsSerial = async (
	prisma: AcsSerialDedupePrisma,
	params: FindExistingDeviceEventByAcsSerialParams,
) => {
	const serialNo = String(params.serialNo || "").trim();
	if (!serialNo) return null;

	const { start, end } = buildAcsSerialLookupWindow(params.eventTime);
	const candidates = await prisma.deviceEvent.findMany({
		where: {
			organizationId: params.organizationId,
			deviceId: params.deviceId,
			eventTime: { gte: start, lte: end },
		},
		orderBy: { receivedAt: "asc" },
		take: ACS_SERIAL_LOOKUP_TAKE,
	});

	return (
		candidates.find(
			(candidate: any) => extractAcsSerialFromPayload(candidate?.payload) === serialNo,
		) || null
	);
};
