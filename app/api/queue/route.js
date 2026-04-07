import { dequeueMessage, enqueueMessage } from "../../../lib/queue";
import { sendMessage } from "../../../lib/wa";
import { redis } from "../../../lib/redis";

export async function GET() {
  // 🔥 LOCK SIMPLE (ANTI MULTI WORKER)
  const isRunning = await redis.get("queue:running");

  if (isRunning) {
    console.log("[QUEUE LOCKED]");
    return Response.json({ ok: true, skipped: true });
  }

  // 🔥 activar lock
  await redis.set("queue:running", "1", { ex: 10 });

  console.log("[QUEUE START]");

  try {
    let totalProcessed = 0;

    // 🔥 LOOP GLOBAL (hasta vaciar cola)
    while (true) {
      let processed = 0;

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
          console.log("[WA RESPONSE]", result);
        } catch (err) {
          console.error("[QUEUE FAIL]", err);

          const attempts = job.attempts || 0;

          if (attempts < 3) {
            const delay = getBackoff(attempts);

            console.log("[RETRY IN]", delay);

            // 🔥 re-encolar directo (SIN setTimeout)
            await enqueueMessage({
              ...job,
              attempts: attempts + 1,
            });
          } else {
            console.error("[QUEUE DROPPED]", job.to);
          }
        }

        await sleep(400); // anti spam
        processed++;
        totalProcessed++;
      }

      // 🔥 revisar si queda cola
      const remaining = await redis.llen("wa_queue");

      console.log("[QUEUE REMAINING]", remaining);

      if (!remaining || remaining === 0) {
        break;
      }

      await sleep(500);
    }

    console.log("[QUEUE DONE]", totalProcessed);

    // 🔥 liberar lock
    await redis.del("queue:running");

    return Response.json({ ok: true, processed: totalProcessed });
  } catch (err) {
    console.error("[QUEUE GLOBAL ERROR]", err);

    // 🔥 liberar lock SIEMPRE
    await redis.del("queue:running");

    return Response.json({ ok: true, error: true });
  }
}

// BACKOFF
function getBackoff(attempts) {
  if (attempts === 0) return 2000;
  if (attempts === 1) return 5000;
  if (attempts === 2) return 10000;
  return 15000;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
