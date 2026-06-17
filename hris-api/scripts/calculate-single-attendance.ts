/**
 * Calculate Single Attendance Script
 * Helper script to recalculate and display metrics for a single attendance record by ID
 * Usage: npx ts-node scripts/calculate-single-attendance.ts <attendanceId> [-tz <timezone>] [-u]
 * Options:
 *   -tz : Timezone (default: Asia/Manila)
 *   -u  : Update the record in the database
 */

import { PrismaClient } from "../generated/prisma";
import { calculateTimekeeping, formatMinutesAsTime, formatTimekeepingSummary } from "../helper/timekeeping.helper";

const prisma = new PrismaClient();

async function main() {
    const args = process.argv.slice(2);
    const attendanceId = args[0];
    
    // Flags
    const timeZoneIndex = args.indexOf("-tz");
    const timeZone = timeZoneIndex !== -1 ? args[timeZoneIndex + 1] : "Asia/Manila";
    const shouldUpdate = args.includes("-u");

    if (!attendanceId || attendanceId.startsWith("-")) {
        console.error("❌ Error: Attendance ID is required");
        console.log("Usage: npx ts-node scripts/calculate-single-attendance.ts <attendanceId> [-tz <timezone>] [-u]");
        process.exit(1);
    }

    console.log("=".repeat(80));
    console.log("SINGLE ATTENDANCE CALCULATOR");
    console.log(`Timezone: ${timeZone}`);
    console.log("=".repeat(80));

    try {
        const attendance = await prisma.attendance.findUnique({
            where: { id: attendanceId },
            include: {
                employee: {
                    select: {
                        employeeId: true,
                        person: {
                            select: {
                                personalInfo: true
                            }
                        }
                    }
                }
            }
        });

        if (!attendance) {
            console.error("❌ Attendance record not found!");
            process.exit(1);
        }

        const name = `${attendance.employee?.person?.personalInfo?.firstName || ''} ${attendance.employee?.person?.personalInfo?.lastName || ''}`;
        console.log(`\n👤 Employee: ${name} (${attendance.employee?.employeeId})`);
        console.log(`📅 Date: ${attendance.date?.toDateString()}`);
        console.log(`🕒 Time In: ${attendance.timeIn ? attendance.timeIn.toISOString() : 'N/A'}`);
        console.log(`🕒 Time Out: ${attendance.timeOut ? attendance.timeOut.toISOString() : 'N/A'}`);
        
        // Show Local Times
        if (attendance.timeIn) {
            console.log(`   Local In:  ${extractLocalTime(attendance.timeIn, timeZone)}`);
        }
        if (attendance.timeOut) {
            console.log(`   Local Out: ${extractLocalTime(attendance.timeOut, timeZone)}`);
        }

        if (attendance.scheduleSnapshot) {
            const schedule = attendance.scheduleSnapshot as any;
            console.log(`\n📋 Schedule: ${schedule.scheduleName} (${schedule.scheduleCode})`);
            
            if (schedule.shifts && Array.isArray(schedule.shifts)) {
                console.log("   Weekly Shifts:");
                schedule.shifts.forEach((shift: any) => {
                    const dayLabel = shift.label.padEnd(4);
                    if (shift.isRestDay) {
                        console.log(`   - ${dayLabel}: 🛌 Rest Day`);
                    } else if (shift.timeSlots && shift.timeSlots.length > 0) {
                        const times = shift.timeSlots
                            .map((ts: any) => `${formatTime12(ts.startTime)} - ${formatTime12(ts.endTime)}`)
                            .join(", ");
                        console.log(`   - ${dayLabel}: 🏢 ${times}`);
                    } else {
                        console.log(`   - ${dayLabel}: (No slots defined)`);
                    }
                });
            }
        } else {
            console.log("\n⚠️  No Schedule Snapshot found (using defaults)");
        }

        // Calculate
        const result = calculateTimekeeping(
            attendance.timeIn,
            attendance.timeOut,
            attendance.scheduleSnapshot,
            attendance.date || new Date(),
            timeZone
        );

        // Display Summary
        console.log(formatTimekeepingSummary(result));

        // Update if requested
        if (shouldUpdate) {
            await prisma.attendance.update({
                where: { id: attendanceId },
                data: {
                    breakMinutes: result.breakMinutes,
                    hoursWorked: formatMinutesAsTime(result.totalMinutesWorked),
                    regularHours: formatMinutesAsTime(result.regularMinutes),
                    overtimeHours: formatMinutesAsTime(result.overtimeMinutes),
                    undertimeHours: formatMinutesAsTime(result.undertimeMinutes),
                    lateHours: formatMinutesAsTime(result.lateMinutes),
                    earlyOutHours: formatMinutesAsTime(result.earlyOutMinutes),
                }
            });
            console.log("\n✅ Database updated successfully!");
        } else {
            console.log("\n📝 View Only (Use -u flag to update database)");
        }

    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

function extractLocalTime(date: Date, timeZone: string): string {
    try {
        return new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: true
        }).format(date);
    } catch (e) {
        return "Invalid Date";
    }
}

function formatTime12(time: string): string {
    if (!time) return '';
    const [hours, minutes] = time.split(':').map(Number);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    return `${h}:${minutes.toString().padStart(2, '0')} ${suffix}`;
}

main();
