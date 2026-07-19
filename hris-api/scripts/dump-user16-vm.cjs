require("tsx/cjs");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("../generated/prisma");
function loadEnv() {
	for (const line of fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8").split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const i = t.indexOf("=");
		if (i < 1) continue;
		const k = t.slice(0, i).trim();
		let v = t.slice(i + 1).trim();
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
			v = v.slice(1, -1);
		if (!process.env[k]) process.env[k] = v;
	}
	for (const key of ["DATABASE_URL", "PG_DATABASE_URL", "WRITE_DATABASE_URL"]) {
		if (process.env[key])
			process.env[key] = process.env[key].replace(/@10\.184\.37\.19:15433\b/g, "@127.0.0.1:55435");
	}
}
(async () => {
	loadEnv();
	const prisma = new PrismaClient();
	const r = await prisma.deviceUser.findFirst({
		where: { id: "cmrrp81rl009z7z04bkn5jbpp" },
	});
	const vm = r?.vendorMetadata || {};
	console.log(
		JSON.stringify(
			{
				keys: Object.keys(vm),
				rawPresent: vm.rawFingerprintPresent,
				tplLen: vm.rawFingerprints?.templates?.[0]?.data?.length,
				src: vm.rawFingerprints?.source,
				cred: vm.credentialSummary,
			},
			null,
			2,
		),
	);
	await prisma.$disconnect();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
