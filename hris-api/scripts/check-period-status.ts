import 'dotenv/config';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

async function check() {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: 'cmpxw13bf001h7zwsyy6k976f' }
  });
  console.log('ID:', period?.id);
  console.log('Name:', period?.name);
  console.log('Status:', period?.status);
  console.log('ProcessedAt:', period?.processedAt);
  console.log('GenerationMetadata:', JSON.stringify(period?.generationMetadata, null, 2));

  const allPeriods = await prisma.payrollPeriod.findMany({
    select: { id: true, name: true, status: true, startDate: true, endDate: true }
  });
  console.log('All periods:', allPeriods);
}

check().catch(console.error).finally(() => prisma.$disconnect());
