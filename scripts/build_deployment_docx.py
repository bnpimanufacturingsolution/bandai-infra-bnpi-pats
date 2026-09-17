import os
import zipfile
import xml.sax.saxutils as saxutils

def escape(text):
    return saxutils.escape(text)

content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>"""

rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

doc_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>"""

font_table_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fontsInfo xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="Segoe UI"><w:pitch w:val="variable"/><w:family w:val="swiss"/></w:font>
  <w:font w:name="Calibri"><w:pitch w:val="variable"/><w:family w:val="swiss"/></w:font>
  <w:font w:name="Consolas"><w:pitch w:val="fixed"/><w:family w:val="modern"/></w:font>
</w:fontsInfo>"""

settings_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
  <w:characterSpacingControl w:val="doNotCompress"/>
</w:settings>"""

styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:color w:val="2D3748"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr>
      <w:spacing w:before="360" w:after="160"/>
      <w:keepNext/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/>
      <w:b/>
      <w:sz w:val="36"/>
      <w:color w:val="0F172A"/>
    </w:rPr>
  </w:style>
  
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr>
      <w:spacing w:before="280" w:after="120"/>
      <w:keepNext/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/>
      <w:b/>
      <w:sz w:val="28"/>
      <w:color w:val="1E293B"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr>
      <w:spacing w:before="200" w:after="80"/>
      <w:keepNext/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/>
      <w:b/>
      <w:sz w:val="24"/>
      <w:color w:val="334155"/>
    </w:rPr>
  </w:style>
</w:styles>"""

class DocxBuilder:
    def __init__(self):
        self.body_elements = []

    def add_title(self, text):
        p = f"""<w:p>
          <w:pPr>
            <w:jc w:val="center"/>
            <w:spacing w:before="240" w:after="100"/>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/>
              <w:b/>
              <w:sz w:val="52"/>
              <w:color w:val="0F172A"/>
            </w:rPr>
            <w:t>{escape(text)}</w:t>
          </w:r>
        </w:p>"""
        self.body_elements.append(p)

    def add_subtitle(self, text):
        p = f"""<w:p>
          <w:pPr>
            <w:jc w:val="center"/>
            <w:spacing w:before="0" w:after="280"/>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/>
              <w:i/>
              <w:sz w:val="24"/>
              <w:color w:val="64748B"/>
            </w:rPr>
            <w:t>{escape(text)}</w:t>
          </w:r>
        </w:p>"""
        self.body_elements.append(p)

    def add_metadata_box(self, items):
        rows_xml = []
        for label, val in items:
            row = f"""<w:tr>
              <w:tc>
                <w:tcPr>
                  <w:tcW w:w="2800" w:type="dxa"/>
                  <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
                  <w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar>
                </w:tcPr>
                <w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="334155"/></w:rPr><w:t>{escape(label)}</w:t></w:r></w:p>
              </w:tc>
              <w:tc>
                <w:tcPr>
                  <w:tcW w:w="6500" w:type="dxa"/>
                  <w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>
                  <w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar>
                </w:tcPr>
                <w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="1E293B"/></w:rPr><w:t>{escape(val)}</w:t></w:r></w:p>
              </w:tc>
            </w:tr>"""
            rows_xml.append(row)

        tbl = f"""<w:tbl>
          <w:tblPr>
            <w:tblW w:w="9300" w:type="dxa"/>
            <w:jc w:val="center"/>
            <w:tblBorders>
              <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
              <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
              <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
              <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
              <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
              <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
            </w:tblBorders>
          </w:tblPr>
          {''.join(rows_xml)}
        </w:tbl>
        <w:p><w:pPr><w:spacing w:after="200"/></w:pPr></w:p>"""
        self.body_elements.append(tbl)

    def add_h1(self, text):
        p = f"""<w:p>
          <w:pPr>
            <w:pStyle w:val="Heading1"/>
            <w:pBdr>
              <w:bottom w:val="single" w:sz="12" w:space="4" w:color="3B82F6"/>
            </w:pBdr>
          </w:pPr>
          <w:r><w:t>{escape(text)}</w:t></w:r>
        </w:p>"""
        self.body_elements.append(p)

    def add_h2(self, text):
        p = f"""<w:p>
          <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
          <w:r><w:t>{escape(text)}</w:t></w:r>
        </w:p>"""
        self.body_elements.append(p)

    def add_h3(self, text):
        p = f"""<w:p>
          <w:pPr><w:pStyle w:val="Heading3"/></w:pPr>
          <w:r><w:t>{escape(text)}</w:t></w:r>
        </w:p>"""
        self.body_elements.append(p)

    def add_paragraph(self, text, bold_prefix=None, italic=False):
        runs = []
        if bold_prefix:
            runs.append(f"""<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{escape(bold_prefix)} </w:t></w:r>""")
        
        r_pr = []
        if italic:
            r_pr.append("<w:i/>")
        r_pr_str = f"<w:rPr>{''.join(r_pr)}</w:rPr>" if r_pr else ""
        runs.append(f"""<w:r>{r_pr_str}<w:t>{escape(text)}</w:t></w:r>""")

        p = f"""<w:p>
          <w:pPr><w:spacing w:after="140"/></w:pPr>
          {''.join(runs)}
        </w:p>"""
        self.body_elements.append(p)

    def add_bullet(self, text, bold_prefix=None):
        runs = []
        if bold_prefix:
            runs.append(f"""<w:r><w:rPr><w:b/><w:color w:val="1E293B"/></w:rPr><w:t xml:space="preserve">{escape(bold_prefix)} </w:t></w:r>""")
        runs.append(f"""<w:r><w:t>{escape(text)}</w:t></w:r>""")

        p = f"""<w:p>
          <w:pPr>
            <w:ind w:left="420" w:hanging="260"/>
            <w:spacing w:after="80"/>
          </w:pPr>
          <w:r><w:rPr><w:color w:val="3B82F6"/></w:rPr><w:t xml:space="preserve">▪  </w:t></w:r>
          {''.join(runs)}
        </w:p>"""
        self.body_elements.append(p)

    def add_alert(self, title, text, alert_type="note"):
        # colors: note=blue (3B82F6, EFF6FF), caution=amber (F59E0B, FEF3C7)
        border_col = "3B82F6" if alert_type == "note" else "EF4444" if alert_type == "caution" else "10B981"
        bg_col = "EFF6FF" if alert_type == "note" else "FEF2F2" if alert_type == "caution" else "ECFDF5"

        p = f"""<w:p>
          <w:pPr>
            <w:pBdr>
              <w:left w:val="single" w:sz="36" w:space="12" w:color="{border_col}"/>
            </w:pBdr>
            <w:shd w:val="clear" w:color="auto" w:fill="{bg_col}"/>
            <w:spacing w:before="160" w:after="160"/>
            <w:ind w:left="240" w:right="240"/>
          </w:pPr>
          <w:r>
            <w:rPr><w:b/><w:color w:val="{border_col}"/><w:sz w:val="22"/></w:rPr>
            <w:t xml:space="preserve">[{escape(title.upper())}] </w:t>
          </w:r>
          <w:r>
            <w:rPr><w:color w:val="1E293B"/><w:sz w:val="21"/></w:rPr>
            <w:t>{escape(text)}</w:t>
          </w:r>
        </w:p>"""
        self.body_elements.append(p)

    def add_code(self, code_lines):
        runs = []
        for i, line in enumerate(code_lines):
            line_xml = f"""<w:r>
              <w:rPr>
                <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
                <w:sz w:val="19"/>
                <w:color w:val="0F172A"/>
              </w:rPr>
              <w:t xml:space="preserve">{escape(line)}</w:t>
            </w:r>"""
            if i < len(code_lines) - 1:
                line_xml += "<w:r><w:br/></w:r>"
            runs.append(line_xml)

        p = f"""<w:p>
          <w:pPr>
            <w:pBdr>
              <w:top w:val="single" w:sz="6" w:space="6" w:color="CBD5E1"/>
              <w:left w:val="single" w:sz="18" w:space="8" w:color="0284C7"/>
              <w:bottom w:val="single" w:sz="6" w:space="6" w:color="CBD5E1"/>
              <w:right w:val="single" w:sz="6" w:space="6" w:color="CBD5E1"/>
            </w:pBdr>
            <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
            <w:spacing w:before="120" w:after="180" w:line="240" w:lineRule="auto"/>
            <w:ind w:left="240" w:right="160"/>
          </w:pPr>
          {''.join(runs)}
        </w:p>"""
        self.body_elements.append(p)

    def add_table(self, headers, rows):
        header_cells = []
        for h in headers:
            c = f"""<w:tc>
              <w:tcPr>
                <w:shd w:val="clear" w:color="auto" w:fill="1E293B"/>
                <w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>
              </w:tcPr>
              <w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="FFFFFF"/></w:rPr><w:t>{escape(h)}</w:t></w:r></w:p>
            </w:tc>"""
            header_cells.append(c)

        tr_list = [f"<w:tr><w:tblHeader/>{''.join(header_cells)}</w:tr>"]

        for row_idx, r in enumerate(rows):
            bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
            cells = []
            for cell_val in r:
                c = f"""<w:tc>
                  <w:tcPr>
                    <w:shd w:val="clear" w:color="auto" w:fill="{bg}"/>
                    <w:tcMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>
                  </w:tcPr>
                  <w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="1E293B"/></w:rPr><w:t>{escape(cell_val)}</w:t></w:r></w:p>
                </w:tc>"""
                cells.append(c)
            tr_list.append(f"<w:tr>{''.join(cells)}</w:tr>")

        tbl = f"""<w:tbl>
          <w:tblPr>
            <w:tblW w:w="9300" w:type="dxa"/>
            <w:jc w:val="center"/>
            <w:tblBorders>
              <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
              <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
              <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
              <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
              <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
              <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
            </w:tblBorders>
          </w:tblPr>
          {''.join(tr_list)}
        </w:tbl>
        <w:p><w:pPr><w:spacing w:after="180"/></w:pPr></w:p>"""
        self.body_elements.append(tbl)

    def build_document_xml(self):
        body_content = "".join(self.body_elements)
        # 1 inch margins (1440 dxa)
        sect_pr = """<w:sectPr>
          <w:pgSz w:w="12240" w:h="15840"/>
          <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
          <w:cols w:space="720"/>
          <w:docGrid w:linePitch="360"/>
        </w:sectPr>"""
        return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    {body_content}
    {sect_pr}
  </w:body>
</w:document>"""

    def save(self, filepath):
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        doc_xml = self.build_document_xml()
        with zipfile.ZipFile(filepath, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", content_types_xml)
            z.writestr("_rels/.rels", rels_xml)
            z.writestr("word/_rels/document.xml.rels", doc_rels_xml)
            z.writestr("word/styles.xml", styles_xml)
            z.writestr("word/fontTable.xml", font_table_xml)
            z.writestr("word/settings.xml", settings_xml)
            z.writestr("word/document.xml", doc_xml)
        print(f"Generated DOCX successfully: {filepath}")

def main():
    b = DocxBuilder()

    # Title & Metadata
    b.add_title("BNPI PATS")
    b.add_subtitle("On-Premises Manual Deployment Guide & Operations Runbook")

    b.add_metadata_box([
        ("System", "Production & Assembly Tracking System (PATS)"),
        ("Organization", "Bandai Namco Philippines Inc. (BNPI)"),
        ("Document Code", "BNPI-PATS-OPS-DEP-001"),
        ("Target Platform", "Hyper-V Virtual Appliance (Ubuntu 24.04 LTS)"),
        ("Appliance LAN IP", "10.184.37.19"),
        ("Runtime Engines", "Docker Compose / Linux Systemd Services / K3s Alternate"),
        ("Classification", "Internal Operations & Technical Manual")
    ])

    b.add_alert("Product Truth Boundary Notice", 
                "As of September 15, 2026, the Hikvision/ZKTeco device lane and the standalone emp-app portal are retired from this codebase. BNPI PATS is dedicated exclusively to factory floor manufacturing execution (PATS WIP routing, stations, lots, inventory) and integrated timekeeping/payroll. Do not deploy retired device containers or legacy portal dependencies.",
                "note")

    # Section 1
    b.add_h1("1. Executive Summary & Topology")
    b.add_paragraph("This runbook details the comprehensive, verified step-by-step procedures for manually deploying, updating, configuring, and verifying the BNPI PATS application on the on-premises virtual appliance at Bandai Namco Philippines.")
    b.add_paragraph("The on-premises deployment operates inside a dedicated Ubuntu Linux Hyper-V virtual machine running on the factory host server, communicating across the factory LAN with static addressing.")

    b.add_table(
        ["Component", "Technology", "On-Premises Role", "Port / Address"],
        [
            ["Host Server", "Windows Server / Win 11", "Hyper-V Virtualization Host", "Switch: ProjectTruth-External"],
            ["Virtual Appliance", "Ubuntu Linux 24.04 LTS", "Core Runtime Appliance Node", "Static LAN IP: 10.184.37.19"],
            ["Frontend App", "React Router 7 / Vite", "Manufacturing & Timekeeping Web UI", "Port 3000 (Prod) / 3100 (Dev) / 3200 (UAT)"],
            ["Backend Core API", "Node.js / Express / Prisma", "REST API & Business Logic Engine", "Port 3001 (Prod) / 3101 (Dev) / 3201 (UAT)"],
            ["Database", "PostgreSQL 16 (Alpine)", "Relational Store (Persistent Volume)", "Port 15432 (Prod) / 15433 (Dev) / 15434 (UAT)"],
            ["Observability", "Prometheus / Grafana / Loki", "LGTM Telemetry & Monitoring", "Grafana: 53000, Prometheus: 9091"],
            ["Public Tunnel", "Cloudflare Named Tunnel", "Zero-inbound remote HTTPS/SSH gateway", "*.bnpi-pats.tech / ssh.bnpi-pats.tech"]
        ]
    )

    # Section 2
    b.add_h1("2. Prerequisites & Credentials")
    b.add_paragraph("Ensure the following prerequisites are met before commencing deployment:")
    b.add_bullet("Windows host workstation connected to the BNPI manufacturing network with routing to 10.184.37.19.", "Host Connectivity:")
    b.add_bullet("%USERPROFILE%\\.ssh\\node-health-appliance_ed25519 installed on the host machine.", "SSH Authentication Key:")
    b.add_bullet("Username infra with full sudo privileges on the guest appliance.", "Appliance User:")
    b.add_bullet("Located at /opt/project-truth inside the guest appliance.", "Repository Working Path:")
    b.add_bullet("Docker Engine (v24+) and Docker Compose (v2+) installed inside the appliance VM.", "Container Runtime:")

    # Section 3
    b.add_h1("3. Step-by-Step Deployment Procedure")

    b.add_h2("Phase 1: Host-Side Preparation (Windows Hyper-V Host)")
    b.add_paragraph("Open an elevated PowerShell prompt on the Windows server hosting the appliance:")
    b.add_paragraph("1. Verify Hyper-V virtual switch and appliance VM status:")
    b.add_code([
        "# Check Hyper-V external switch",
        "Get-VMSwitch -Name \"ProjectTruth-External\"",
        "",
        "# Verify virtual machine status",
        "Get-VM -Name \"project-truth-local-vhdx-proof\""
    ])

    b.add_paragraph("2. Start the virtual machine if it is not currently running:")
    b.add_code([
        "Start-VM -Name \"project-truth-local-vhdx-proof\""
    ])

    b.add_paragraph("3. Verify network reachability and SSH listener:")
    b.add_code([
        "# Test ping to appliance IP",
        "Test-Connection -ComputerName 10.184.37.19 -Count 3",
        "",
        "# Verify SSH TCP port 22",
        "Test-NetConnection -ComputerName 10.184.37.19 -Port 22"
    ])

    b.add_paragraph("4. Establish SSH session into the appliance:")
    b.add_code([
        "ssh -i $env:USERPROFILE\\.ssh\\node-health-appliance_ed25519 infra@10.184.37.19"
    ])

    b.add_h2("Phase 2: Appliance Workspace & Git Code Sync (Linux VM)")
    b.add_paragraph("All subsequent commands are executed directly in the guest Linux shell (infra@project-truth-node):")
    b.add_paragraph("1. Navigate to the installation directory and verify resources:")
    b.add_code([
        "cd /opt/project-truth",
        "pwd",
        "free -h",
        "df -h /"
    ])

    b.add_paragraph("2. Fetch latest tested codebase from canonical remote:")
    b.add_code([
        "# Fetch remote branches",
        "git fetch origin develop",
        "",
        "# Switch to develop branch and pull latest changes",
        "git checkout develop",
        "git pull origin develop",
        "",
        "# Confirm head commit",
        "git log -1 --oneline"
    ])

    b.add_paragraph("3. Review and verify the API environment configuration:")
    b.add_code([
        "cat /opt/project-truth/appliance/env/bnpi-pats-api.env"
    ])
    b.add_paragraph("Verify key environment variables in the file:")
    b.add_bullet("NODE_ENV=production")
    b.add_bullet("PORT=3001")
    b.add_bullet("DATABASE_URL=postgresql://postgres:postgres@bnpi-pats-postgres:5432/bnpi_pats")
    b.add_bullet("JWT_SECRET=<secure_production_secret>")
    b.add_bullet("OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318")

    b.add_h2("Phase 3: Starting Observability Stack")
    b.add_paragraph("1. Ensure the shared Docker telemetry network exists:")
    b.add_code([
        "docker network inspect bnpi-pats-observability >/dev/null 2>&1 || \\",
        "docker network create bnpi-pats-observability"
    ])

    b.add_paragraph("2. Launch Prometheus, Grafana, Loki, and OpenTelemetry collector:")
    b.add_code([
        "cd /opt/project-truth/bnpi-pats-api/infrastructure/onprem/observability",
        "docker compose up -d"
    ])

    b.add_paragraph("3. Verify observability endpoint health:")
    b.add_code([
        "curl -fsS http://127.0.0.1:53000/api/health",
        "curl -fsS http://127.0.0.1:9091/-/ready",
        "curl -fsS http://127.0.0.1:3110/ready"
    ])

    b.add_h2("Phase 4: Database Provisioning & Safe Schema Migration")
    b.add_alert("Data Safety Warning",
                "Never run prisma-reset, prisma-seed, or db push --accept-data-loss on Production or UAT databases. Always use safe deployment migrations to protect factory lot tracking and timesheet records.",
                "caution")

    b.add_paragraph("1. Start the PostgreSQL container:")
    b.add_code([
        "cd /opt/project-truth/appliance",
        "docker compose up -d postgres"
    ])

    b.add_paragraph("2. Wait for PostgreSQL readiness check to pass:")
    b.add_code([
        "until docker exec bnpi-pats-postgres pg_isready -U postgres -d bnpi-pats >/dev/null 2>&1; do",
        "  echo \"Waiting for database readiness...\"",
        "  sleep 2",
        "done",
        "echo \"PostgreSQL is ready.\""
    ])

    b.add_paragraph("3. Apply pending Prisma schema migrations safely:")
    b.add_code([
        "cd /opt/project-truth/bnpi-pats-api",
        "npx prisma generate --schema prisma/schema.prisma",
        "npx prisma generate --schema prisma/pats/schema.prisma",
        "npm run prisma:pats:migrate:deploy"
    ])

    b.add_h2("Phase 5: Building Application Container Images")
    b.add_paragraph("1. Build the Backend REST API container image:")
    b.add_code([
        "cd /opt/project-truth/bnpi-pats-api",
        "BUILD_SHA=$(git rev-parse --short HEAD)",
        "docker build --build-arg PROJECT_TRUTH_BUILD_SHA=\"$BUILD_SHA\" -t bnpi-pats-api-local:develop ."
    ])

    b.add_paragraph("2. Build the Frontend Web Application container image:")
    b.add_code([
        "cd /opt/project-truth/bnpi-pats-app",
        "docker build --build-arg VITE_API_BASE_URL=/api -t bnpi-pats-app-local:develop ."
    ])

    b.add_paragraph("3. Confirm built images in Docker registry:")
    b.add_code([
        "docker images | grep -E \"bnpi-pats-api-local|bnpi-pats-app-local\""
    ])

    b.add_h2("Phase 6: Starting Application Services")
    b.add_paragraph("Launch the application services using one of the following operational methods:")
    b.add_paragraph("Method A: Docker Compose Direct Launch (Standard Single Stack):")
    b.add_code([
        "cd /opt/project-truth/appliance",
        "docker compose up -d --no-deps bnpi-pats-api bnpi-pats-app"
    ])

    b.add_paragraph("Method B: Multi-Environment Production Stack:")
    b.add_code([
        "cd /opt/project-truth/appliance",
        "docker compose -f docker-compose.environments.yml up -d --no-deps \\",
        "  bnpi-pats-api-prod \\",
        "  bnpi-pats-app-prod"
    ])

    b.add_paragraph("Method C: Linux Systemd Management Service (Recommended for unattended restarts):")
    b.add_code([
        "sudo systemctl daemon-reload",
        "sudo systemctl restart project-truth-bnpi-pats.service",
        "sudo systemctl status project-truth-bnpi-pats.service --no-pager"
    ])

    b.add_paragraph("Method D: Appliance CLI Command:")
    b.add_code([
        "project-truth-bnpi-pats-start",
        "# or specify environment:",
        "project-truth-bnpi-pats-env-start prod"
    ])

    b.add_h2("Phase 7: Cloudflare Named Tunnel Verification")
    b.add_paragraph("Verify that the outbound Cloudflare Named Tunnel is operating normally to allow public and remote access without opening inbound firewall ports:")
    b.add_code([
        "sudo systemctl status cloudflared-bnpi-pats.service --no-pager",
        "journalctl -u cloudflared-bnpi-pats.service -n 20 --no-pager"
    ])

    # Section 4
    b.add_h1("4. Post-Deployment Verification & Acceptance")
    b.add_paragraph("Perform both local and remote verification probes to confirm full system readiness:")
    b.add_paragraph("1. In-Appliance Local Probes:")
    b.add_code([
        "# Check API Health",
        "curl -i http://127.0.0.1:3001/health",
        "",
        "# Check Web App Health",
        "curl -i http://127.0.0.1:3000/health",
        "",
        "# Inspect active containers",
        "docker ps --format \"table {{.Names}}\\t{{.Status}}\\t{{.Ports}}\""
    ])

    b.add_paragraph("2. Windows Host Probes (from Windows PowerShell):")
    b.add_code([
        "# Test API over LAN",
        "curl.exe -s http://10.184.37.19:3001/health",
        "",
        "# Test Web App over LAN",
        "curl.exe -s -o $null -w \"HTTP Status: %{http_code}`n\" http://10.184.37.19:3000/"
    ])

    b.add_paragraph("3. Automated Contract Test Suite:")
    b.add_code([
        "# In repository root on Windows host:",
        "powershell -File scripts/test-self-heal-contract.ps1"
    ])

    b.add_paragraph("4. User Interface Browser Verification:")
    b.add_bullet("Open Chrome/Edge and navigate to http://10.184.37.19:3000.", "1. URL:")
    b.add_bullet("Login using admin@bandai.local / password123.", "2. Authentication:")
    b.add_bullet("Verify dashboard cards, navigation drawer, and production metrics render cleanly.", "3. Dashboard:")
    b.add_bullet("Navigate to Planning Desk, Line Setup, and Station Scanning to ensure all manufacturing routes load.", "4. Workstations:")

    # Section 5
    b.add_h1("5. Maintenance, Troubleshooting & Disaster Recovery")
    b.add_paragraph("Operational maintenance commands for on-premises administrators:")

    b.add_paragraph("1. Live Container Log Streaming:")
    b.add_code([
        "# Stream API logs",
        "docker logs -f --tail 100 bnpi-pats-api",
        "",
        "# Stream Web App logs",
        "docker logs -f --tail 100 bnpi-pats-app",
        "",
        "# Stream PostgreSQL logs",
        "docker logs -f --tail 50 bnpi-pats-postgres"
    ])

    b.add_paragraph("2. On-Demand Database Backup:")
    b.add_code([
        "# Execute database dump",
        "/opt/project-truth/appliance/bin/project-truth-db-access.sh backup",
        "",
        "# View backup archives",
        "ls -lh /srv/bnpi-pats/backups/"
    ])

    b.add_paragraph("3. Emergency Rollback Procedure:")
    b.add_paragraph("In the event of an unexpected fault in a newly deployed build:")
    b.add_code([
        "# 1. Revert to previous git commit",
        "cd /opt/project-truth",
        "git checkout <PREVIOUS_COMMIT_SHA>",
        "",
        "# 2. Rebuild images",
        "cd /opt/project-truth/bnpi-pats-api && docker build -t bnpi-pats-api-local:develop .",
        "cd /opt/project-truth/bnpi-pats-app && docker build --build-arg VITE_API_BASE_URL=/api -t bnpi-pats-app-local:develop .",
        "",
        "# 3. Restart application containers",
        "cd /opt/project-truth/appliance",
        "docker compose up -d --no-deps bnpi-pats-api bnpi-pats-app"
    ])

    # Section 6
    b.add_h1("6. Operational Command Reference Table")
    b.add_table(
        ["Action", "Shell Command", "Target / Location"],
        [
            ["SSH to VM", "ssh -i $env:USERPROFILE\\.ssh\\node-health-appliance_ed25519 infra@10.184.37.19", "Windows Host"],
            ["Code Sync", "cd /opt/project-truth && git fetch origin develop && git pull", "Guest VM"],
            ["Start DB", "cd /opt/project-truth/appliance && docker compose up -d postgres", "Guest VM"],
            ["Prisma Migrations", "cd /opt/project-truth/bnpi-pats-api && npm run prisma:pats:migrate:deploy", "Guest VM"],
            ["Build API", "cd /opt/project-truth/bnpi-pats-api && docker build -t bnpi-pats-api-local:develop .", "Guest VM"],
            ["Build App", "cd /opt/project-truth/bnpi-pats-app && docker build -t bnpi-pats-app-local:develop .", "Guest VM"],
            ["Start Containers", "cd /opt/project-truth/appliance && docker compose up -d bnpi-pats-api bnpi-pats-app", "Guest VM"],
            ["Restart Service", "sudo systemctl restart project-truth-bnpi-pats.service", "Guest VM"],
            ["API Health", "curl -fsS http://127.0.0.1:3001/health", "Guest VM"],
            ["App Health", "curl -fsS http://127.0.0.1:3000/health", "Guest VM"],
            ["Check Tunnel", "sudo systemctl status cloudflared-bnpi-pats.service", "Guest VM"],
            ["Database Backup", "/opt/project-truth/appliance/bin/project-truth-db-access.sh backup", "Guest VM"]
        ]
    )

    # Save to both paths
    manuals_path = os.path.abspath("docs/manuals/BNPI-PATS-OnPrem-Deployment-Manual.docx")
    docs_root_path = os.path.abspath("docs/BNPI-PATS-OnPrem-Deployment-Manual.docx")

    b.save(manuals_path)
    b.save(docs_root_path)

if __name__ == "__main__":
    main()
