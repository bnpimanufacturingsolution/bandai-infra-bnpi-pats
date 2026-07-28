#!/usr/bin/env python3
"""Write colorful DEV/UAT/PROD comparison xlsx without openpyxl (stdlib only)."""
from __future__ import annotations

import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

# Live stamp 2026-07-28T03:41Z
ROWS = [
    # (metric, dev, uat, prod, note)
    ("CPU limit total (cores)", "3.3", "2.4", "4.3", "Sum of main workload limits"),
    ("CPU limit API", "1.5", "1", "2", "Hard max"),
    ("CPU limit App", "0.3", "0.4", "0.5", ""),
    ("CPU limit Postgres", "0.8", "0.8", "1.5", ""),
    ("CPU limit Hikvision watcher", "0.5", "—", "—", "DEV only"),
    ("RAM limit total", "4.5 GiB", "3.1 GiB", "5.8 GiB", "Sum of main workload limits"),
    ("RAM limit API", "2 GiB", "1.5 GiB", "3 GiB", "Hard max"),
    ("RAM limit App", "256 MiB", "384 MiB", "512 MiB", ""),
    ("RAM limit Postgres", "1.5 GiB", "1 GiB", "2 GiB", ""),
    ("RAM limit Hikvision watcher", "512 MiB", "—", "—", "DEV only"),
    ("Disk Postgres PVC", "20 GiB", "20 GiB", "20 GiB", "Bound"),
    ("Disk uploads PVC", "20 GiB", "20 GiB", "20 GiB", "Bound"),
    ("Employees", "2225", "2225", "2225", "Same"),
    ("Users (login)", "2048", "2048", "2048", "Same"),
    ("Departments", "34", "34", "34", "Same"),
    ("Persons", "10840", "10840", "10840", "Same"),
    ("Documents", "8680", "8680", "8680", "Same"),
    ("Attendances", "87215", "87215", "87215", "Same"),
    ("Timesheets", "10972", "10972", "10972", "Same"),
    ("Timesheet lines", "129360", "129360", "129360", "Same"),
    ("Applicants", "7", "7", "7", "Same"),
    ("Devices (active)", "9", "9", "9", "Same"),
    ("Devices (all rows)", "16", "16", "16", "Same"),
    ("Device users", "5885", "5692", "5692", "DEV higher (+193)"),
    ("Device events", "37371", "20374", "20374", "DEV higher (+16997) — live after clone"),
    ("API ready", "1/1", "1/1", "1/1", ""),
    ("App ready", "1/1", "1/1", "1/1", ""),
    ("Postgres ready", "1/1", "1/1", "1/1", ""),
    ("Shared node CPU", "8 cores (shared)", "8 cores (shared)", "8 cores (shared)", "All envs co-located"),
    ("Shared node RAM", "~13.4 GiB (shared)", "~13.4 GiB (shared)", "~13.4 GiB (shared)", "All envs co-located"),
]

WHY_DEV_HIGHER = [
    "Question: Why is DEV higher than UAT when UAT should be later?",
    "",
    "Answer: UAT/PROD are not 'later in time' copies that keep growing.",
    "On 2026-07-24 DEV was cloned into UAT and PROD (business parity).",
    "After that clone:",
    "  - HR core (employees, users, attendances, timesheets) stayed equal.",
    "  - DEV kept receiving LIVE Hikvision taps/SDK inventory → device_events and device_users grew.",
    "  - UAT/PROD did not get that same live device stream at the same rate.",
    "",
    "So DEV is ahead on DEVICE runtime data, not because UAT is older — because DEV is the hot live lab.",
    "If you want UAT/PROD device_events/device_users = DEV, re-clone or re-sync device tables only (authorized).",
    "",
    "Expected pattern if UAT were a frozen snapshot of DEV:",
    "  employees equal  ✓",
    "  device_events DEV >= UAT/PROD  ✓ (DEV continues live)",
]


def col_letter(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def cell(ref: str, value: str, style: str | None = None) -> str:
    v = escape(str(value))
    if style:
        return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t>{v}</t></is></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t>{v}</t></is></c>'


def build_sheet1() -> str:
    # styles: 0 default, 1 header, 2 metric, 3 same, 4 higher, 5 note
    rows_xml = []
    # title
    rows_xml.append(
        f'<row r="1">'
        f'{cell("A1", "Project Truth — DEV / UAT / PROD compare", "1")}'
        f'{cell("B1", "", "1")}{cell("C1", "", "1")}{cell("D1", "", "1")}{cell("E1", "Stamp 2026-07-28T03:41Z live", "1")}'
        f"</row>"
    )
    rows_xml.append(
        f'<row r="2">'
        f'{cell("A2", "Metric", "1")}'
        f'{cell("B2", "DEV", "1")}'
        f'{cell("C2", "UAT", "1")}'
        f'{cell("D2", "PROD", "1")}'
        f'{cell("E2", "Note", "1")}'
        f"</row>"
    )
    for i, (metric, dev, uat, prod, note) in enumerate(ROWS, start=3):
        # color style for device diffs
        style_dev = "2"
        style_uat = "2"
        style_prod = "2"
        if metric in ("Device users", "Device events"):
            style_dev = "4"  # green highlight DEV higher
            style_uat = "3"
            style_prod = "3"
        elif note == "Same":
            style_dev = style_uat = style_prod = "3"
        elif "limit" in metric.lower() or metric.startswith("CPU") or metric.startswith("RAM"):
            if "PROD" in note or metric.startswith("CPU limit API") or metric.startswith("RAM limit API"):
                style_prod = "4"
        rows_xml.append(
            f'<row r="{i}">'
            f'{cell(f"A{i}", metric, "2")}'
            f'{cell(f"B{i}", dev, style_dev)}'
            f'{cell(f"C{i}", uat, style_uat)}'
            f'{cell(f"D{i}", prod, style_prod)}'
            f'{cell(f"E{i}", note, "5")}'
            f"</row>"
        )
    last = 2 + len(ROWS)
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:E{last}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>
    <col min="1" max="1" width="32" customWidth="1"/>
    <col min="2" max="2" width="18" customWidth="1"/>
    <col min="3" max="3" width="18" customWidth="1"/>
    <col min="4" max="4" width="18" customWidth="1"/>
    <col min="5" max="5" width="40" customWidth="1"/>
  </cols>
  <sheetData>
    {"".join(rows_xml)}
  </sheetData>
  <autoFilter ref="A2:E{last}"/>
</worksheet>
"""


def build_sheet2() -> str:
    rows_xml = []
    for i, line in enumerate(WHY_DEV_HIGHER, start=1):
        rows_xml.append(f'<row r="{i}">{cell(f"A{i}", line, "5" if i > 1 else "1")}</row>')
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols><col min="1" max="1" width="100" customWidth="1"/></cols>
  <sheetData>{"".join(rows_xml)}</sheetData>
</worksheet>
"""


STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>
    <font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><sz val="11"/><color rgb="FF334155"/><name val="Calibri"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf>
  </cellXfs>
</styleSheet>
"""

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>
"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
"""

WB = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="DEV-UAT-PROD" sheetId="1" r:id="rId1"/>
    <sheet name="Why DEV higher" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>
"""

WB_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"""


def main():
    repo_root = Path(__file__).resolve().parents[1]
    template_xlsx = repo_root / "docs" / "templates" / "DEV-UAT-PROD-env-compare.xlsx"
    runtime_xlsx = (
        repo_root / ".runtime" / "env-compare-20260728" / "DEV-UAT-PROD-compare.xlsx"
    )
    # Prefer permanent template path; always also write /tmp when on appliance.
    outputs: list[Path] = []
    for path in (template_xlsx, runtime_xlsx, Path("/tmp/DEV-UAT-PROD-compare.xlsx")):
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            outputs.append(path)
        except Exception:
            continue
    if not outputs:
        outputs = [Path("/tmp/DEV-UAT-PROD-compare.xlsx")]
        outputs[0].parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "[Content_Types].xml": CONTENT_TYPES,
        "_rels/.rels": RELS,
        "xl/workbook.xml": WB,
        "xl/_rels/workbook.xml.rels": WB_RELS,
        "xl/styles.xml": STYLES,
        "xl/worksheets/sheet1.xml": build_sheet1(),
        "xl/worksheets/sheet2.xml": build_sheet2(),
    }
    for out in outputs:
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
            for name, data in payload.items():
                z.writestr(name, data)
        print(str(out))


if __name__ == "__main__":
    main()
