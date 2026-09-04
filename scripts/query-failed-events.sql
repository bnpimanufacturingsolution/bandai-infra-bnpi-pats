SELECT de."id", de.payload->>'employeeNo' as emp_no, de."createdAt", de."errorMessage",
  a."id" as attendance_id, a."employeeId" as att_emp_id, a."date", a."timeIn", a."timeOut", a."status" as att_status
FROM device_events de
LEFT JOIN employees e ON e."deviceEmpId" = de.payload->>'employeeNo' OR e."employeeId" = de.payload->>'employeeNo'
LEFT JOIN attendances a ON a."employeeId" = e."id" AND a."date" = de."createdAt"::date
WHERE de.status = 'FAILED' AND de."createdAt" > '2026-08-25'
ORDER BY de."createdAt" DESC
LIMIT 20;
