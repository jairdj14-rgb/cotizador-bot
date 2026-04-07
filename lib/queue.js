import { redis } from "./redis";

const QUEUE_KEY = "wa_queue";

// 🔥 agregar a la cola
export async function enqueueMessage(job) {
  const isPro = job?.plan === "pro";

  const payload = JSON.stringify({
    ...job,
    attempts: job.attempts ?? 0,
    ts: Date.now(),
  });

  if (isPro) {
    await redis.lpush(QUEUE_KEY, payload);
  } else {
    await redis.rpush(QUEUE_KEY, payload);
  }

  // 🔥 DEBUG AQUÍ
  const len = await redis.llen(QUEUE_KEY);
  console.log("[QUEUE LENGTH AFTER ENQUEUE]", len);
}

// 🔥 sacar de la cola
export async function dequeueMessage() {
  // 🔥 DEBUG ANTES
  const lenBefore = await redis.llen(QUEUE_KEY);
  console.log("[QUEUE LENGTH BEFORE DEQUEUE]", lenBefore);

  const job = await redis.lpop(QUEUE_KEY);
  if (!job) return null;

  try {
    return JSON.parse(job);
  } catch {
    return null;
  }
}
