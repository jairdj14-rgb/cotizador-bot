import { dequeueMessage, enqueueMessage } from "../../../lib/queue";
import { sendMessage } from "../../../lib/wa";
import { redis } from "../../../lib/redis";

const QUEUE_KEY = "wa_queue";

export async function GET() {
  try {
    console.log("[QUEUE START]");
    let processed = 0;
    // =========================
    // 🔁 LOOP GLOBAL (hasta vaciar cola)
    // =========================
    while (true) {
      const job = await dequeueMessage();

      if (!job) break;
      try {
        console.log("[SENDING TO]", job.to);

        await sendMessage(job.to, job.response);

        console.log("[QUEUE OK]", job.to);
      } catch (err) {
        console.error("[QUEUE FAIL]", err);

        const attempts = job.attempts || 0;

        if (attempts < 3) {
          const delay = getBackoff(attempts);

          console.log("[RETRY IN]", delay);

          //  reintento controlado (sin setTimeout)
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

      await sleep(400); //  anti rate limit global
      processed++;
    }
    console.log("[QUEUE DONE]", processed);

    return Response.json({
      ok: true,
      processed,
    });
  } catch (err) {
    console.error("[QUEUE GLOBAL ERROR]", err);

    return Response.json({
      ok: true,
      error: true,
    });
  }
}
// =========================
//  BACKOFF
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
