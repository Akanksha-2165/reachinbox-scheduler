# ReachInbox Scheduler - System Notes & Design Decisions

## Block 2 Design Decisions

This document outlines the architectural rationale behind the concurrency, rate limiting, and idempotency mechanisms implemented in Block 2.

---

### 1. Idempotency Strategy

Email delivery systems must guarantee that an email is never sent more than once, even under network timeouts, worker crashes, retry loops, or duplicate API calls. Block 2 implements a two-tier defense:

* **Tier 1: Queue-Level Idempotency (`jobId = email.id`)**
  * When scheduling emails via `POST /api/schedule`, every BullMQ job is registered with `jobId = email.id` (the MySQL primary key UUID).
  * BullMQ enforces job ID uniqueness across active, waiting, and delayed sets in Redis. If a client submits a duplicate schedule request for the same email ID, Redis rejects or ignores the duplicate job creation.
* **Tier 2: Database-Level Atomic Claim (`scheduled` -> `sending`)**
  * In `src/worker.ts`, before any network calls to SMTP or Redis counters, the worker executes:
    ```ts
    const claim = await prisma.email.updateMany({
      where: { id: emailId, status: 'scheduled' },
      data: { status: 'sending' },
    });
    ```
  * In MySQL, this conditional update is atomic and leverages row-level write locks. If two workers or concurrent processes race to execute the same job, exactly one worker receives `claim.count === 1`. Any other worker receives `claim.count === 0` and immediately terminates without dispatching.
  * On successful send, the status transitions to `sent`. On network/SMTP failure, the status transitions to `failed` with the error stack preserved. If the sender's hourly limit is reached, status is reset to `scheduled` and delayed to the next hour.

---

### 2. Lua Script Atomicity for Rate Limiting

The per-sender hourly counter is stored in Redis under the key `rate:{senderId}:{hourWindow}` where `hourWindow = Math.floor(now / 3600000)`.

* **The Problem with Multi-Step Commands:**
  * If a worker executes `INCR rateKey` followed by `EXPIRE rateKey 7200` as two distinct commands, a worker crash or connection failure between the two operations would leave the key in Redis without an expiration time. Over time, orphaned keys accumulate in memory, and counters would fail to roll over cleanly.
* **The Atomic Lua Solution:**
  * We execute an atomic Lua script via `ioredis.eval`:
    ```lua
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('EXPIRE', KEYS[1], 7200)
    end
    return current
    ```
  * Redis guarantees that Lua scripts execute atomically in a single event-loop turn. No command from any other worker can interleave between the increment and the expiration. The 2-hour TTL (7200s) ensures the key auto-cleans without leaving stale state.
* **Counter Rollback on Limit Hit:**
  * When `currentCount > limit`, the worker calls `undoRateLimitIncrement(rateKey)` (`DECR rateKey`). Because the blocked email was deferred to the next hour and not sent, rolling back the counter ensures that this rejected attempt does not consume a valid quota slot.

---

### 3. Why Not BullMQ's Native Limiter for Per-Sender Limits?

BullMQ provides a built-in worker limiter option:
```ts
limiter: {
  max: 1,
  duration: MIN_DELAY_BETWEEN_SENDS_MS,
}
```
* **Limiter Scope is Queue-Wide:**
  * BullMQ's worker limiter is global to the entire queue and all workers attached to that queue. It does not support dynamic sharding or per-tenant/per-sender buckets.
* **Preventing Starvation Across Senders:**
  * If Sender A schedules 500 emails and exhausts their hourly limit, pausing the queue via BullMQ's limiter would halt processing for Sender B and Sender C, even if they have zero sent emails in the current hour window.
* **Architectural Separation of Concerns:**
  * **BullMQ Worker Limiter:** Enforces physical provider throttling (`MIN_DELAY_BETWEEN_SENDS_MS` queue-wide) to avoid overwhelming SMTP endpoints.
  * **Redis Lua Script:** Enforces dynamic, isolated, per-sender quotas (`rate:{senderId}:{hourWindow}`) without cross-sender interference.

---

### 4. Behavior Under Load: What Happens with 1000 Emails at Once?

When 1000 emails are submitted simultaneously for immediate scheduling:

1. **Round-Robin Load Distribution:**
   * `POST /api/schedule` loops through all 1000 recipients and distributes them evenly across available senders (e.g. ~333 emails per sender across 3 senders).
2. **Controlled Worker Consumption:**
   * Workers pull jobs concurrently up to `WORKER_CONCURRENCY` (e.g. 5 concurrent jobs per worker instance), throttled by `MIN_DELAY_BETWEEN_SENDS_MS` to prevent spike loads on SMTP.
3. **Graceful Hour Overflow (Zero Dropped Jobs):**
   * As soon as a sender reaches their `hourlyLimit` (e.g. 50/hr), the atomic Lua script detects `currentCount > limit`.
   * The worker invokes `onRateLimitHit(senderId, hourWindow)` (logging now, Slack alerts in Block 3).
   * The counter is decremented via `undoRateLimitIncrement`.
   * The email row in MySQL has its status reset to `scheduled` and its `scheduledAt` updated to the start of the next hour window (`nextHourWindow * 3600000`).
   * **Order Preservation:** An offset of `(index * 100ms)` is added to `scheduledAt` so that the batch maintains its original sequence when the next hour opens.
   * `await job.moveToDelayed(nextScheduledAtMs, token)` puts the job back into Redis's delayed zset using the worker's lock token and original `jobId`.
4. **Resilience & Zero Starvation:**
   * Other senders with remaining hourly quota continue processing uninterrupted.
   * No emails are dropped, none are marked as failed, and Redis memory remains stable.
