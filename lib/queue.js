import { redis } from "./redis";

const QUEUE_KEY = "wa_queue";

// =========================
// 🧹 LIMPIAR COLA (solo para debug)
// =========================
export async function clearQueue() {
  await redis.del(QUEUE_KEY);
  console.log("[QUEUE CLEARED]");
}

// =========================
// 🔥 ENQUEUE
// =========================
export async function enqueueMessage(job) {
  const isPro = job?.plan === "pro";

  const payload = JSON.stringify({
    ...job,
    attempts: job.attempts ?? 0,
    ts: Date.now(),
  });

  // 🔥 PRIORIDAD (pro primero)
  if (isPro) {
    await redis.lpush(QUEUE_KEY, payload);
  } else {
    await redis.rpush(QUEUE_KEY, payload);
  }

  // DEBUG
  const len = await redis.llen(QUEUE_KEY);
  console.log("[QUEUE LENGTH AFTER ENQUEUE]", len);
}

// =========================
// 🔥 DEQUEUE (FIX REAL)
// =========================
export async function dequeueMessage() {
  const lenBefore = await redis.llen(QUEUE_KEY);
  console.log("[QUEUE LENGTH BEFORE DEQUEUE]", lenBefore);

  // 🔥 CLAVE: usar rpop para FIFO real
  const job = await redis.rpop(QUEUE_KEY);

  if (!job) {
    console.log("[QUEUE EMPTY AFTER RPOP]");
    return null;
  }

  try {
    const parsed = JSON.parse(job);
    console.log("[QUEUE JOB DEQUEUED]", parsed);
    return parsed;
  } catch (err) {
    console.error("[QUEUE PARSE ERROR]", err);
    return null;
  }
}
