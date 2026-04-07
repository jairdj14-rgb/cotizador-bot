import { dequeueMessage, enqueueMessage } from "../../../lib/queue";
import { sendMessage } from "../../../lib/wa";

export async function GET() {
  console.log("[REDIS URL QUEUE]", process.env.UPSTASH_REDIS_REST_URL);
  console.log("[QUEUE START]");

  try {
    let processed = 0;

    while (processed < 5) {
      console.log("[QUEUE LOOP]", processed);

      const job = await dequeueMessage();

      if (!job) {
        console.log("[QUEUE EMPTY]");
        break;
      }

      console.log("[QUEUE JOB]", job);

      try {
        console.log("[SENDING TO]", job.to);
        console.log("[SENDING PAYLOAD]", job.response);

        const result = await sendMessage(job.to, job.response);

        console.log("[WHATSAPP RESPONSE]", result);

        console.log("[QUEUE SENT RESULT]", result);
        console.log("[QUEUE OK]", job.to);
      } catch (err) {
        console.error("[QUEUE FAIL FULL]", {
          error: err?.message,
          stack: err?.stack,
          raw: err,
        });

        const attempts = job.attempts || 0;

        if (attempts < 3) {
          const delay = getBackoff(attempts);

          console.log("[RETRY IN]", delay, "ms");

          // ⚠️ IMPORTANTE: esto en Vercel puede no ejecutarse siempre
          setTimeout(async () => {
            try {
              await enqueueMessage({
                ...job,
                attempts: attempts + 1,
              });
              console.log("[RETRY ENQUEUED]");
            } catch (e) {
              console.error("[RETRY ENQUEUE ERROR]", e);
            }
          }, delay);
        } else {
          console.error("[QUEUE DROPPED]", job.to);
        }
      }

      await sleep(400); // anti spam
      processed++;
    }

    return Response.json({ ok: true, processed });
  } catch (err) {
    console.error("[QUEUE GLOBAL ERROR]", err);

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
