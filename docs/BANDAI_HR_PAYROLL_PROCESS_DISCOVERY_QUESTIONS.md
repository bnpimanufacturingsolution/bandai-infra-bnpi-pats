# Bandai / BNPI HR — Payroll Process Discovery Questions

**Purpose:** Client interview guide for understanding Bandai/BNPI HR’s **current (as-is)** payroll process before mapping or refining it in BNPI PATS.

**Audience:** Project team interviewing HR / payroll / finance operators.

**How to use:**

1. Walk through **one real cutoff** (not a theoretical ideal).
2. For each answer capture: **who → what file/system → when → what if wrong**.
3. Prefer samples and files over verbal policy only.
4. End with: “What must never change when we move this into BNPI PATS?”
5. Label anything not confirmed in the meeting as `NEEDS_CONFIRMATION`.

**Related internal context (not client-confirmed truth):**

- DM workflow: `docs/dm-migration-workflow.md`
- Recent parity checklist: `docs/BNPI_JUNE26_JULY10_2026_PAYROLL_PARITY_CHECKLIST.md`
- Known modeling assumptions (confirm with HR):
  - Semi-monthly: period 1 = **11–25**, period 2 = **26–10**
  - Contributions: period 1 full / period 2 none
  - Excel register + compensation/deduction mass uploads + biometrics + approved OT

---

## Opening script

> We’re not redesigning your policies today. We want to understand **exactly how you process payroll now** for one real cutoff — who does what, which files, what freezes when, and what always goes wrong. Then we can map that cleanly into BNPI PATS without changing your business rules.

**Suggested sample cutoff for walkthrough:** June 26 – July 10, 2026 (or the latest completed register).

---

## 1. End-to-end payroll process

| # | Question | Answer / notes | Owner | Evidence / file |
|---|---|---|---|---|
| 1 | Can you walk us through **one full payroll cutoff**, from first attendance pull to employees getting paid? | | | |
| 2 | Who owns each step (timekeeping, HR, payroll, finance, department heads)? | | | |
| 3 | How long does one cutoff usually take (calendar days + person-hours)? | | | |
| 4 | What is the **official cutoff calendar** (attendance end date, OT freeze, approval deadline, pay date)? | | | |
| 5 | What systems do you use today (Excel only? Excel + device software? bank portal? BIR/SSS portals)? | | | |
| 6 | What is the **final source of truth** for what employees get paid — the computation workbook, bank file, or something else? | | | |
| 7 | After payroll is paid, what is locked vs still editable (corrections, late OT, manual adjustments)? | | | |

---

## 2. Cutoffs, periods, and who is included

| # | Question | Answer / notes | Owner | Evidence / file |
|---|---|---|---|---|
| 8 | Confirm: is payroll **semi-monthly** with **11–25** and **26–10**? | | | |
| 9 | Are pay dates always around the **15th** and **end of month / 30th**? | | | |
| 10 | Who is in each run (regular, probationary, agency, resigning, LOA, new hires mid-cutoff)? | | | |
| 11 | How do you handle **agency / contractor** vs direct employees for payroll? | | | |
| 12 | How do mid-period hires, resignations, and transfers affect basic pay and days worked? | | | |
| 13 | Do you ever run **special payrolls** (13th month, bonus, final pay, retro) separate from the regular cut? | | | |

---

## 3. Attendance, DTR, and timesheets

| # | Question | Answer / notes | Owner | Evidence / file |
|---|---|---|---|---|
| 14 | Where does raw time data come from (attendance software export, manual DTR, supervisor sheet)? | | | |
| 15 | Who pulls biometrics each cutoff, and in what format (Excel export, system report)? | | | |
| 16 | How are **absent, late, undertime, incomplete logs** decided and approved? | | | |
| 17 | Who reviews and **approves timesheets** before payroll? Is approval formal or informal? | | | |
| 18 | If biometric logs conflict with a supervisor’s record, which wins? | | | |
| 19 | Do you recompute days worked from schedule + punches, or paste hours from another report? | | | |
| 20 | How do leave days (VL/SL/etc.) show up in payroll — paid leave, unpaid, or separate? | | | |

---

## 4. Overtime, rest day, holiday, night differential

| # | Question | Answer / notes | Owner | Evidence / file |
|---|---|---|---|---|
| 21 | Who files OT (employee, supervisor, line leader)? | | | |
| 22 | What is the **approval chain** before OT is paid? | | | |
| 23 | Is there a separate **Approved Overtime Details** report every cutoff? Who generates it? | | | |
| 24 | How do you distinguish: regular OT, rest day, rest day OT, special holiday, legal holiday, night differential? | | | |
| 25 | Can OT still enter payroll after the timesheet is “closed”? | | | |
| 26 | How do you handle **Adjustment OT / ND** (e.g. Adjustment Holiday Pay, AON) — formula vs manual? | | | |

---

## 5. Basic salary and earnings

| # | Question | Answer / notes | Owner | Evidence / file |
|---|---|---|---|---|
| 27 | Where is **monthly/basic salary** maintained (employee 201 file, Excel master, another system)? | | | |
| 28 | When salary changes mid-cutoff, which rate do you use for that period? | | | |
| 29 | Is basic pay always **monthly ÷ 2** for semi-monthly, or days-worked based? | | | |
| 30 | How do you compute **No. of Days** for the period? | | | |
| 31 | Which allowances are **fixed every period** vs **variable / performance-based**? | | | |
| 32 | For common items, who qualifies and how is amount decided? Meal Allowance (MLA), Perfect Attendance (PFA), De Minimis (DMA), Line Leader (LLA), HYS Meal / OB / OT Meal, others? | | | |
| 33 | Which allowances go into **GrossPay**, and which only into **TotalReceivable** after net? | | | |
| 34 | What is the difference, in your language, between **NetPay** and **TotalReceivable**? | | | |

---

## 6. Deductions, loans, statutory, tax

| # | Question | Answer / notes | Owner | Evidence / file |
|---|---|---|---|---|
| 35 | Which statutory contributions are deducted **period 1 only**, and which every period? | | | |
| 36 | Confirm practice: **SSS / PhilHealth / Pag-IBIG = full on first cutoff, none on second?** | | | |
| 37 | Who maintains contribution tables when SSS/PhilHealth/Pag-IBIG rates change? | | | |
| 38 | How is **withholding tax** computed (table, BIR software, Excel formula, third party)? | | | |
| 39 | What loan types do you regularly deduct (SSS salary/emergency, Pag-IBIG/HDMF, RCBC, company loan, uniform, etc.)? | | | |
| 40 | Who gives the **loan amortization list** each cutoff (HR, finance, bank, agency)? | | | |
| 41 | How do you handle **one-time deductions** vs recurring loans? | | | |
| 42 | If a loan amount on the register differs from the remittance board, which is correct? | | | |
| 43 | What is **Modified HDMF 2** / similar special deductions — policy and who enrolls it? | | | |

---

## 7. Actual “compute payroll” step (Excel / tools)

| # | Question | Answer / notes | Owner | Evidence / file |
|---|---|---|---|---|
| 44 | Which file is the **official payroll computation workbook** for a cutoff? | | | |
| 45 | Who prepares it, and from which inputs (copy-paste order)? | | | |
| 46 | Are formulas protected/passworded? Who holds the password? | | | |
| 47 | Do you process **all departments at once**, or by department/section? | | | |
| 48 | What checks do you do before calling payroll “final” (spot checks, variance vs last cut, headcount)? | | | |
| 49 | What are the top 5 recurring pain points or manual fixes every cutoff? | | | |
| 50 | How often does payroll get **recomputed** after “final” because something was late? | | | |

---

## 8. Approvals, payment, and compliance

| # | Question | Answer / notes | Owner | Evidence / file |
|---|---|---|---|---|
| 51 | Who signs off payroll before disbursement (HR head, finance, plant manager)? | | | |
| 52 | How is money paid (bank transfer file, cash, check, multiple banks)? | | | |
| 53 | Who generates the bank file, and in what format? | | | |
| 54 | Do employees receive **payslips**? Paper, email, portal, or only upon request? | | | |
| 55 | How do you handle **payslip disputes** after pay day? | | | |
| 56 | How are remittances done (SSS, PhilHealth, Pag-IBIG, BIR) — monthly schedule and owner? | | | |
| 57 | What reports does management require every cutoff (register, loan summary, OT cost, headcount)? | | | |

---

## 9. Corrections, exceptions, edge cases

| # | Question | Answer / notes | Owner | Evidence / file |
|---|---|---|---|---|
| 58 | How do you handle late approved OT after the register is done? | | | |
| 59 | How do you process **underpayment / overpayment** corrections? | | | |
| 60 | How do final pay, back pay, and retro salary increases work? | | | |
| 61 | How do suspensions, AWOL, and incomplete biometric enrollment affect pay? | | | |
| 62 | Any employees or groups with **special rules** (managers, drivers, agency, night shift only)? | | | |
| 63 | What must always stay **manual** (policy), even if the system can automate it? | | | |

---

## 10. Files and samples to request

Ask HR to bring or send for the sample cutoff:

| File / artifact | Why needed | Received? | Path / notes |
|---|---|---|---|
| Latest **Payroll Computation** workbook (1 full cutoff) | Target register / truth | [ ] | |
| **Compensation mass upload** for that cutoff | Allowance enrollments | [ ] | |
| **Deduction mass upload** for that cutoff | Loans / deductions | [ ] | |
| **Biometrics / DTR** for that cutoff | Attendance basis | [ ] | |
| **Approved OT details** report | OT / holiday / RD truth | [ ] | |
| Sample **payslip** (anonymized OK) | Net vs receivable language | [ ] | |
| Bank/disbursement sample (headers only if sensitive) | Payment process | [ ] | |
| Written cutoff calendar / SOP if any | Process ownership | [ ] | |

**Sample employees (walk line by line):** pick 3–5 together — include at least one with OT + loan + allowance, and one simple case.

| Emp No. | Name | Why selected | Notes |
|---|---|---|---|
| | | OT + loan + allowance | |
| | | Simple / clean row | |
| | | Agency or special case | |
| | | Exception / dispute history | |

---

## 11. Closing questions

| # | Question | Answer / notes | Owner | Evidence / file |
|---|---|---|---|---|
| 64 | If we could fix only **three** payroll pain points in the system, what would they be? | | | |
| 65 | What would make you trust the BNPI PATS payroll run enough to **stop using the Excel register** as primary? | | | |
| 66 | Who should be the day-to-day BNPI PATS payroll operator after go-live, and who is backup? | | | |

---

## Optional: BNPI PATS mapping notes (fill after interview)

Map confirmed process steps to BNPI PATS / DM surfaces. Leave blank until HR answers are captured.

| Client current step | Confirmed owner | Source file / system | BNPI PATS / DM target | Open risk |
|---|---|---|---|---|
| Setup / cycle / rates | | | DM0 / Setup | |
| Org + schedules | | | DM1 | |
| Policies / benefit & loan types | | | DM2 | |
| Employees + salary + enrollments | | | DM3 | |
| Attendance / timesheets / approved OT | | | DM4 | |
| Run payroll / history | | | Run Payroll / DM5 | |
| Approvals / bank / payslip | | | (product + process) | |

---

## Interview metadata

| Field | Value |
|---|---|
| Meeting date | |
| Attendees (client) | |
| Attendees (project) | |
| Sample cutoff used | |
| Next follow-up | |
| Key decisions | |
| Blockers / missing files | |

---

## Quick reference — process areas to cover

1. End-to-end walkthrough  
2. Cutoffs and population  
3. Attendance / DTR / timesheets  
4. OT / RD / holiday / ND  
5. Basic salary and earnings  
6. Deductions / loans / statutory / tax  
7. Excel compute and controls  
8. Approvals, payment, compliance  
9. Corrections and exceptions  
10. Files and sample employees  
11. Pain points and go-live trust  

---

*Generated for Bandai/BNPI HR payroll discovery. Update answers in this file after the client interview; do not treat pre-interview modeling assumptions as confirmed client truth.*
