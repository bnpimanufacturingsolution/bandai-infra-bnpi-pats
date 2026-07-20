import { classifyHikvisionLogSearchRow } from "../helper/hikvision-event-contract.helper.ts";
const cases = [
  { majorType: "Information", minorType: "Add Fingerprint..." },
  { majorType: "Information", minorType: "Add Person Inf..." },
  { majorType: "Information", minorType: "Add Fingerprint" },
  { majorType: "Information", minorType: "Add Person Info" },
  { majorType: "Information", minorType: "Add Person" },
];
for (const c of cases) {
  const r = classifyHikvisionLogSearchRow(c as any);
  console.log(JSON.stringify({ minor: c.minorType, action: r?.eventAction, label: r?.eventLabel }));
}
