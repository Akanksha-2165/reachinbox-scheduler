import { prisma } from '../src/lib/prisma.js';
import { redisClient } from '../src/config/redis.js';
import { emailQueue, EMAIL_JOB_NAME } from '../src/queues/emailQueue.js';

const API_BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('==========================================================');
  console.log('  ReachInbox Scheduler - Block 2 Verification Test Suite  ');
  console.log('==========================================================\n');

  // Step 1: Fetch a sender
  console.log('[Step 1] Fetching active sender from database...');
  const sender = await prisma.sender.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!sender) {
    console.error('❌ No senders found in database. Please run "npm run seed" first.');
    process.exit(1);
  }
  console.log(`Using Sender: ${sender.name} (${sender.id})\n`);

  // Step 2: Clear Redis rate key for the current hour window for clean test
  const now = Date.now();
  const currentHourWindow = Math.floor(now / 3600000);
  const rateKey = `rate:${sender.id}:${currentHourWindow}`;
  await redisClient.del(rateKey);
  console.log(`[Step 2] Cleared Redis rate key: ${rateKey}\n`);

  // =========================================================================
  // TEST (a): hourlyLimit=2, 5 recipients -> 2 sent, 3 pushed to next hour
  // =========================================================================
  console.log('----------------------------------------------------------');
  console.log('TEST (a): hourlyLimit=2, 5 recipients');
  console.log('Expected: 2 sent, 3 rescheduled to next hour as scheduled, 0 failed');
  console.log('----------------------------------------------------------');

  const recipients = [
    'recipient1@example.com',
    'recipient2@example.com',
    'recipient3@example.com',
    'recipient4@example.com',
    'recipient5@example.com',
  ];

  const schedulePayload = {
    senderId: sender.id,
    hourlyLimit: 2,
    subject: 'Block 2 Rate Limit Test',
    body: 'Testing 5 recipients with hourlyLimit=2 on a single sender',
    recipients,
    startTime: new Date().toISOString(),
    delayBetweenMs: 0,
  };

  const scheduleRes = await fetch(`${API_BASE_URL}/api/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schedulePayload),
  });

  if (!scheduleRes.ok) {
    console.error('❌ POST /api/schedule failed:', await scheduleRes.text());
    process.exit(1);
  }

  const scheduleData = (await scheduleRes.json()) as { count: number; emails: { id: string }[] };
  console.log(`Successfully scheduled ${scheduleData.count} emails.`);
  const emailIds = scheduleData.emails.map((e) => e.id);

  console.log('Waiting 10 seconds for BullMQ worker to process with concurrency and rate limits...');
  await new Promise((r) => setTimeout(r, 10000));

  // Query database for all 5 emails
  const rows = await prisma.email.findMany({
    where: { id: { in: emailIds } },
    orderBy: { createdAt: 'asc' },
  });

  const sentEmails = rows.filter((r) => r.status === 'sent');
  const scheduledEmails = rows.filter((r) => r.status === 'scheduled');
  const failedEmails = rows.filter((r) => r.status === 'failed');

  console.log('\nResults in Database:');
  console.log(`  Total Emails:        ${rows.length}`);
  console.log(`  Sent:                ${sentEmails.length}`);
  console.log(`  Scheduled (Delayed): ${scheduledEmails.length}`);
  console.log(`  Failed:              ${failedEmails.length}`);

  let testAPassed = true;

  if (sentEmails.length !== 2) {
    console.error(`❌ Assertion Failed: Expected exactly 2 sent emails, got ${sentEmails.length}`);
    testAPassed = false;
  }
  if (scheduledEmails.length !== 3) {
    console.error(`❌ Assertion Failed: Expected exactly 3 scheduled emails, got ${scheduledEmails.length}`);
    testAPassed = false;
  }
  if (failedEmails.length !== 0) {
    console.error(`❌ Assertion Failed: Expected 0 failed emails, got ${failedEmails.length}`);
    testAPassed = false;
  }

  // Verify scheduledAt of delayed emails is >= nextHourStartMs
  const nextHourStartMs = (currentHourWindow + 1) * 3600000;
  for (const sch of scheduledEmails) {
    const schTime = new Date(sch.scheduledAt).getTime();
    if (schTime >= nextHourStartMs) {
      console.log(`  ✔ Email ${sch.id} scheduledAt correctly moved to next hour window: ${sch.scheduledAt.toISOString()}`);
    } else {
      console.error(`  ❌ Email ${sch.id} scheduledAt is NOT in next hour: ${sch.scheduledAt.toISOString()}`);
      testAPassed = false;
    }
  }

  if (testAPassed) {
    console.log('\n✅ TEST (a) PASSED: Exactly 2 sent, 3 pushed to next hour as "scheduled", 0 "failed".\n');
  } else {
    console.error('\n❌ TEST (a) FAILED.\n');
  }

  // =========================================================================
  // TEST (b): Scheduling / dispatching the same email twice does not send twice
  // =========================================================================
  console.log('----------------------------------------------------------');
  console.log('TEST (b): Idempotency Verification');
  console.log('Expected: Scheduling or claiming the same email twice does not duplicate send');
  console.log('----------------------------------------------------------');

  const targetEmail = sentEmails[0];
  console.log(`Target Email ID: ${targetEmail.id}`);
  console.log(`Current Status:  ${targetEmail.status}`);
  console.log(`Sent At:         ${targetEmail.sentAt?.toISOString()}`);

  console.log('\n1. Attempting to re-add exact same Email ID to BullMQ with jobId = email.id...');
  const bullMqAddResult = await emailQueue.add(
    EMAIL_JOB_NAME,
    { emailId: targetEmail.id },
    { jobId: targetEmail.id }
  );
  console.log(`BullMQ job returned ID: ${bullMqAddResult.id}`);

  console.log('\n2. Simulating worker atomic conditional claim on this email ID:');
  const claimResult = await prisma.email.updateMany({
    where: { id: targetEmail.id, status: 'scheduled' },
    data: { status: 'sending' },
  });
  console.log(`Atomic update claim count: ${claimResult.count}`);

  const finalRow = await prisma.email.findUnique({
    where: { id: targetEmail.id },
  });

  let testBPassed = true;
  if (claimResult.count !== 0) {
    console.error(`❌ Assertion Failed: Claim count expected 0, got ${claimResult.count}`);
    testBPassed = false;
  }
  if (finalRow?.status !== 'sent') {
    console.error(`❌ Assertion Failed: Status changed to ${finalRow?.status}`);
    testBPassed = false;
  }
  if (finalRow?.sentAt?.toISOString() !== targetEmail.sentAt?.toISOString()) {
    console.error('❌ Assertion Failed: sentAt timestamp was modified!');
    testBPassed = false;
  }

  if (testBPassed) {
    console.log('  ✔ Atomic claim returned count=0. Worker skips already processed/sent email.');
    console.log('  ✔ DB record remains status="sent" with original sentAt timestamp.');
    console.log('\n✅ TEST (b) PASSED: Scheduling the same email twice does not send twice.\n');
  } else {
    console.error('\n❌ TEST (b) FAILED.\n');
  }

  console.log('==========================================================');
  if (testAPassed && testBPassed) {
    console.log('  ALL BLOCK 2 TESTS PASSED! 🎉');
  } else {
    console.log('  SOME TESTS FAILED. ❌');
  }
  console.log('==========================================================');

  await prisma.$disconnect();
  await redisClient.quit();
  await emailQueue.close();

  if (!testAPassed || !testBPassed) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
