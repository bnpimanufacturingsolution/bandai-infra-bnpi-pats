# Script to replace importFromXLSX function with async version
$filePath = "c:\Users\anoni\OneDrive\Desktop\a\HRIS\Hris-Api\app\attendance\attendance.controller.ts"

Write-Host "Reading file..." -ForegroundColor Cyan
$content = Get-Content $filePath -Raw

# The new implementation
$newImplementation = @'
	/**
	 * Generalized attendance import from XLSX file
	 * Expects columns: EMPLOYEE_ID, DATE, TIME_IN, TIME_OUT, STATUS, NOTES (optional)
	 */
	const importFromXLSX = async (req: AuthRequest, res: Response, _next: NextFunction) => {
		try {
			const file = req.file;
			if (!file) {
				const errorResponse = buildErrorResponse("No file uploaded", 400);
				res.status(400).json(errorResponse);
				return;
			}

			const organizationId = req.organizationId;
			if (!organizationId) {
				const errorResponse = buildErrorResponse(
					"Organization ID not found in authentication token",
					401,
				);
				res.status(401).json(errorResponse);
				return;
			}

			attendanceLogger.info(
				`Starting generalized attendance import for organization ${organizationId}, file: ${file.originalname}`,
			);

			const workbook = XLSX.read(file.buffer, { type: "buffer" });
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: true, defval: null });

			if (!rawData || rawData.length === 0) {
				const errorResponse = buildErrorResponse("Excel file is empty or invalid", 400);
				res.status(400).json(errorResponse);
				return;
			}

			attendanceLogger.info(`Parsed ${rawData.length} rows from Excel file`);

			// Parse rows into AttendanceRow format for the service
			const attendanceRows: Array<{
				employeeId: string;
				date: Date;
				timeIn: Date | null;
				timeOut: Date | null;
				status: string;
				notes?: string;
			}> = [];

			// Helper function to parse time with date
			const parseTimeWithDate = (timeValue: any, baseDate: Date): Date | null => {
				if (typeof timeValue === "number") {
					const excelEpoch = new Date(1899, 11, 30);
					return new Date(excelEpoch.getTime() + timeValue * 24 * 60 * 60 * 1000);
				} else if (timeValue instanceof Date) {
					return timeValue;
				} else if (typeof timeValue === "string") {
					const timeStr = timeValue.trim();
					let parsed = new Date(timeStr);
					if (!isNaN(parsed.getTime())) {
						return parsed;
					}
					const year = baseDate.getUTCFullYear();
					const month = String(baseDate.getUTCMonth() + 1).padStart(2, "0");
					const day = String(baseDate.getUTCDate()).padStart(2, "0");
					const dateStr = `${year}-${month}-${day}`;
					parsed = new Date(`${dateStr} ${timeStr}`);
					if (!isNaN(parsed.getTime())) {
						return parsed;
					}
				}
				return null;
			};

			let rowIndex = 0;
			for (const row of rawData) {
				rowIndex++;
				try {
					const rowData = row as any;
					const employeeId = rowData.EMPLOYEE_ID || rowData["Employee ID"] || rowData.employee_id || rowData.EMP_ID || rowData["Emp ID"];
					if (!employeeId) continue;

					const dateValue = rowData.DATE || rowData.Date || rowData.date;
					if (!dateValue) continue;

					let attendanceDate: Date;
					try {
						if (typeof dateValue === "number") {
							const utcMs = (dateValue - 25569) * 86400 * 1000;
							const utcDate = new Date(utcMs);
							attendanceDate = new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate(), 0, 0, 0, 0));
						} else if (dateValue instanceof Date) {
							attendanceDate = new Date(Date.UTC(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate(), 0, 0, 0, 0));
						} else {
							const parsed = new Date(String(dateValue));
							attendanceDate = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0));
						}
						if (isNaN(attendanceDate.getTime())) throw new Error("Invalid date");
					} catch (error) {
						continue;
					}

					const timeInValue = rowData.TIME_IN || rowData["Time In"] || rowData.time_in;
					const timeOutValue = rowData.TIME_OUT || rowData["Time Out"] || rowData.time_out;
					let timeIn: Date | null = null;
					let timeOut: Date | null = null;

					if (timeInValue) {
						try { timeIn = parseTimeWithDate(timeInValue, attendanceDate); } catch (error) { }
					}
					if (timeOutValue) {
						try { timeOut = parseTimeWithDate(timeOutValue, attendanceDate); } catch (error) { }
					}

					const statusValue = rowData.STATUS || rowData.Status || rowData.status;
					const status = statusValue ? String(statusValue).toUpperCase() : "PRESENT";
					const notes = rowData.NOTES || rowData.Notes || rowData.notes || null;

					attendanceRows.push({
						employeeId: String(employeeId),
						date: attendanceDate,
						timeIn,
						timeOut,
						status,
						notes,
					});
				} catch (error) {
					attendanceLogger.error(`Error parsing row ${rowIndex}: ${error}`);
				}
			}

			if (attendanceRows.length === 0) {
				const errorResponse = buildErrorResponse("No valid attendance rows found", 400);
				res.status(400).json(errorResponse);
				return;
			}

			// Start import in background using AttendanceImportService
			const importService = new AttendanceImportService(prisma, organizationId);
			const importPromise = importService.importAttendance(attendanceRows);
			const initialResult = await importPromise;
			const jobId = initialResult.jobId;

			attendanceLogger.info(`Started import job ${jobId} for ${attendanceRows.length} records`);

			// Invalidate cache after import completes (in background)
			importPromise.then(() => {
				invalidateCache.byPattern("cache:attendance:*").catch((cacheError) => {
					attendanceLogger.warn("Failed to invalidate cache after import:", cacheError);
				});
			});

			// Return jobId immediately (202 Accepted for async operation)
			const responseData = {
				jobId,
				message: "Import started",
				total: attendanceRows.length,
			};

			const successResponse = buildSuccessResponse(
				"Attendance import started successfully",
				responseData,
				202,
			);
			res.status(202).json(successResponse);
		} catch (error) {
			attendanceLogger.error(`Error importing attendance from XLSX: ${error}`);
			const errorResponse = buildErrorResponse(
				`Failed to import attendance: ${error instanceof Error ? error.message : String(error)}`,
				500,
			);
			res.status(500).json(errorResponse);
		}
	};
'@

Write-Host "Finding function boundaries..." -ForegroundColor Cyan

# Find the start of importFromXLSX function
$startPattern = '\s*/\*\*\s*\r?\n\s*\* Generalized attendance import from XLSX file'
$startMatch = [regex]::Match($content, $startPattern)

if (!$startMatch.Success) {
    Write-Host "ERROR: Could not find function start!" -ForegroundColor Red
    exit 1
}

# Find the end - look for the closing }; after the function
$searchStart = $startMatch.Index
$functionContent = $content.Substring($searchStart)

# Find the matching closing brace and semicolon
$braceCount = 0
$inFunction = $false
$endIndex = -1

for ($i = 0; $i -lt $functionContent.Length; $i++) {
    $char = $functionContent[$i]
    
    if ($char -eq '{') {
        $braceCount++
        $inFunction = $true
    }
    elseif ($char -eq '}') {
        $braceCount--
        if ($inFunction -and $braceCount -eq 0) {
            # Found the closing brace, now look for semicolon
            if ($i + 1 -lt $functionContent.Length -and $functionContent[$i + 1] -eq ';') {
                $endIndex = $searchStart + $i + 2
                break
            }
        }
    }
}

if ($endIndex -eq -1) {
    Write-Host "ERROR: Could not find function end!" -ForegroundColor Red
    exit 1
}

Write-Host "Function found from index $($startMatch.Index) to $endIndex" -ForegroundColor Green
Write-Host "Old function length: $($endIndex - $startMatch.Index) characters" -ForegroundColor Yellow

# Replace the function
$before = $content.Substring(0, $startMatch.Index)
$after = $content.Substring($endIndex)
$newContent = $before + $newImplementation + $after

Write-Host "New function length: $($newImplementation.Length) characters" -ForegroundColor Yellow

# Backup original file
$backupPath = $filePath + ".backup"
Copy-Item $filePath $backupPath -Force
Write-Host "Backup created: $backupPath" -ForegroundColor Green

# Write new content
$newContent | Set-Content $filePath -NoNewline
Write-Host "File updated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  - Replaced importFromXLSX function" -ForegroundColor White
Write-Host "  - Old: ~$([math]::Round(($endIndex - $startMatch.Index) / 1024, 1))KB" -ForegroundColor White
Write-Host "  - New: ~$([math]::Round($newImplementation.Length / 1024, 1))KB" -ForegroundColor White
Write-Host "  - Backup: $backupPath" -ForegroundColor White
