// Ensure Nodemailer does NOT cache testAccount in memory across multiple calls
process.env.ETHEREAL_CACHE = 'false';

import 'dotenv/config';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed script creates 3 Ethereal test accounts using nodemailer.createTestAccount()
 * and persists them into MySQL via Prisma.
 *
 * WHY:
 * Ethereal is a disposable SMTP sandbox provided by Nodemailer for testing without
 * sending actual emails. By disabling ETHEREAL_CACHE and generating 3 unique accounts,
 * we enable round-robin sender assignment across scheduled email batches.
 */
async function main() {
  console.log('--- Initializing Senders Seed ---');

  // Check existing senders
  const existingCount = await prisma.sender.count();
  if (existingCount >= 3) {
    console.log(`Database already contains ${existingCount} senders.`);
    const existingSenders = await prisma.sender.findMany({ take: 3 });
    console.table(
      existingSenders.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        smtpHost: s.smtpHost,
        smtpPort: s.smtpPort,
      }))
    );
    return;
  }

  // Clear any partial records to guarantee a clean set of 3 senders
  if (existingCount > 0 && existingCount < 3) {
    console.log(`Found partial senders (${existingCount}). Resetting senders table...`);
    await prisma.sender.deleteMany();
  }

  console.log('Generating 3 unique Ethereal test accounts...');
  const createdSenders = [];

  for (let i = 1; i <= 3; i++) {
    console.log(`Creating Ethereal test account ${i}/3...`);
    const testAccount = await nodemailer.createTestAccount();

    const sender = await prisma.sender.create({
      data: {
        name: `Ethereal Sender ${i}`,
        email: testAccount.user,
        smtpHost: testAccount.smtp.host,
        smtpPort: testAccount.smtp.port,
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    createdSenders.push({
      id: sender.id,
      name: sender.name,
      email: sender.email,
      smtpHost: sender.smtpHost,
      smtpPort: sender.smtpPort,
      user: sender.user,
    });
  }

  console.log('\n Successfully seeded 3 Ethereal senders:');
  console.table(createdSenders);
}

main()
  .catch((e) => {
    console.error(' Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
