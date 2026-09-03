import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://postgres:postgres@10.184.37.19:15433/hris?schema=public"
    }
  }
});

async function main() {
  console.log("Starting diagnosis for employeeNo 1044 / Jelisa Antonis Santonia...");

  // 1. Find the DeviceUser
  const deviceUser = await prisma.deviceUser.findFirst({
    where: {
      vendorUserId: "1044"
    },
    include: {
      employee: {
        include: {
          person: true
        }
      }
    }
  });

  console.log("DeviceUser found:", JSON.stringify(deviceUser, null, 2));

  if (!deviceUser) {
    console.log("No DeviceUser found with vendorUserId = 1044");
  }

  // 2. Find recent DeviceEvents for 1044
  const deviceEvents = await prisma.deviceEvent.findMany({
    where: {
      employeeNo: "1044"
    },
    orderBy: {
      eventTime: "desc"
    },
    take: 5
  });

  console.log("Recent DeviceEvents for 1044:", JSON.stringify(deviceEvents, null, 2));

  // 3. Find any Attendance record for this employee around 2026-08-27
  if (deviceUser?.employeeId) {
    const attendance = await prisma.attendance.findMany({
      where: {
        employeeId: deviceUser.employeeId,
        date: {
          gte: new Date("2026-08-26T00:00:00.000Z"),
          lte: new Date("2026-08-28T00:00:00.000Z")
        }
      },
      orderBy: {
        date: "desc"
      }
    });
    console.log("Attendance records around 2026-08-27:", JSON.stringify(attendance, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
