import { redis } from "./redis";

const QUEUE_KEY = "wa_queue";

// 🔥 agregar a la cola
export async function enqueueMessage(job) {
  const isPro = job?.plan === "pro";

  const payload = JSON.stringify({
    ...job,
    attempts: job.attempts ?? 0, // 🔥 nuevo
    ts: Date.now(),
  });

  if (isPro) {
    await redis.lpush(QUEUE_KEY, payload);
  } else {
    await redis.rpush(QUEUE_KEY, payload);
  }
}

// 🔥 sacar de la cola
export async function dequeueMessage() {
  const job = await redis.lpop(QUEUE_KEY);
  if (!job) return null;

  try {
    return JSON.parse(job);
  } catch {
    return null;
  }
}
