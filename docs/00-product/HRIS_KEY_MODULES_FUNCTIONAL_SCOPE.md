# HRIS Key Modules & Functional Scope

> Source: operator-provided specification screenshots, transcribed 2026-08-24.
> Scope: BNPI HRIS module breakdown (modules 1-8) plus technical requirements.

## Key Modules & Functional Scope

### 1. Payroll & Compensation

- Payroll processing, payslip generation, last pay computation
- BNPI salary loan application, allowance tracking (Line Leader, OB, Assembly Standing)
- Mass uploading of compensation and deductions
- Uniform deduction, loan reports, payroll summary, labor cost analysis
- Overtime summary (Agency & Direct)

### 2. Attendance & Timekeeping

- Daily attendance summary, cut-off encoding
- Monthly/annual perfect attendance reports
- Tardiness, Undertime and overtime details, direct vs indirect labor reports
- Leave Tardiness and Undertime monitoring, leave balance tracking, manhour reference
- No work report, daily active manpower, agency attendance summary

### 3. Leave & Disciplinary Management

- Leave conversion, annual leave credit uploads
- Disciplinary action monitoring, late attendance tracking
- Lists of pregnant and no-work employees

### 4. Employee Records & Lifecycle

- Certificate of employment generation
- Organizational chart builder
- Monthly birthday celebrants (employees and kids)
- Personnel Action Notice (PAN), regularization, exit clearance
- TIN library, 201 filing

### 5. Manpower & Statutory Reports

- Mandatory reports (SSS, Pag-ibig, PhilHealth)
- Statutory report generator
- Monthly manpower report (gender, age, headcount, averages)
- BNPI and agency manpower databanks, turnover rate analysis

### 6. Training & Performance

- Annual training plan and summary
- Training attendance databank
- Post-training evaluation and performance summaries

### 7. Recruitment & Onboarding

- Recruitment tracker and updates
- Candidate profile screening
- Recruitment pipeline (application to onboarding)

### 8. Accounting & Compliance

- Monthly: Terminal pay computation with BIR Form 2316, withholding tax (BIR Form 1604-C)
- Annual: Alphabetical list of employees with BIR documents, BIR Form 1604-CF, BIR Form 2316

## Technical Requirements

- Web-based, mobile-responsive interface
- Role-based access control with 2FA
- Secure data encryption and audit logging
- Integration with government APIs (SSS, Pag-ibig, PhilHealth, BIR)
- Export formats: PDF, Excel, CSV
- Daily automated backups with cloud redundancy
