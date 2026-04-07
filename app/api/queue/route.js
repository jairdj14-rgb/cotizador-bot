import { dequeueMessage, enqueueMessage } from "../../../lib/queue";
import { sendMessage } from "../../../lib/wa";
import { redis } from "../../../lib/redis";

const QUEUE_KEY = "wa_queue";
const LOCK_KEY = "queue:running";

export async function GET() {
  try {
    // =========================
    // 🔒 LOCK (ANTI MULTI WORKER)
    // =========================
    const isRunning = await redis.get(LOCK_KEY);

    if (isRunning) {
      console.log("[QUEUE LOCKED]");
      return Response.json({ ok: true, skipped: true });
    }

    // lock con TTL por seguridad
    await redis.set(LOCK_KEY, "1", { ex: 15 });

    console.log("[QUEUE START]");

    let totalProcessed = 0;

    // =========================
    // 🔁 LOOP GLOBAL (hasta vaciar cola)
    // =========================
    while (true) {
      let processed = 0;

      // =========================
      // 📦 BATCH (5 mensajes)
      // =========================
      while (processed < 5) {
        console.log("[QUEUE LOOP]", totalProcessed);

        const job = await dequeueMessage();

        if (!job) {
          console.log("[QUEUE EMPTY]");
          break;
        }

        console.log("[QUEUE JOB]", job);

        try {
          console.log("[SENDING TO]", job.to);

          const result = await sendMessage(job.to, job.response);

          console.log("[QUEUE OK]", job.to);
          console.log("[WA RESULT]", result);
        } catch (err) {
          console.error("[QUEUE FAIL]", err);

          const attempts = job.attempts || 0;

          if (attempts < 3) {
            const delay = getBackoff(attempts);

            console.log("[RETRY IN]", delay);

            // 🔥 reintento controlado (sin setTimeout)
            await sleep(delay);

            await enqueueMessage({
              ...job,
              attempts: attempts + 1,
            });

            console.log("[RETRY ENQUEUED]");
          } else {
            console.error("[QUEUE DROPPED]", job.to);
          }
        }

        await sleep(400); // 🔥 anti rate limit global
        processed++;
        totalProcessed++;
      }

      // =========================
      // 🔍 REVISAR SI QUEDA COLA
      // =========================
      const remaining = await redis.llen(QUEUE_KEY);

      console.log("[QUEUE REMAINING]", remaining);

      if (!remaining || remaining === 0) {
        break;
      }

      // pequeña pausa entre batches
      await sleep(500);
    }

    console.log("[QUEUE DONE]", totalProcessed);

    // =========================
    // 🔓 LIBERAR LOCK
    // =========================
    await redis.del(LOCK_KEY);

    return Response.json({
      ok: true,
      processed: totalProcessed,
    });
  } catch (err) {
    console.error("[QUEUE GLOBAL ERROR]", err);

    // 🔓 liberar lock SIEMPRE
    await redis.del(LOCK_KEY);

    return Response.json({
      ok: true,
      error: true,
    });
  }
}

// =========================
// ⏱ BACKOFF
// =========================
function getBackoff(attempts) {
  if (attempts === 0) return 2000;
  if (attempts === 1) return 5000;
  if (attempts === 2) return 10000;
  return 15000;
}

// =========================
// 💤 SLEEP
// =========================
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
