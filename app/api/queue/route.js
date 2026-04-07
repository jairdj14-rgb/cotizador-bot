import { dequeueMessage, enqueueMessage } from "@/lib/queue";
import { sendMessage } from "@/lib/wa";

export async function GET() {
  let processed = 0;

  while (processed < 5) {
    const job = await dequeueMessage();

    if (!job) break;

    try {
      await sendMessage(job.to, job.response);
      console.log("[QUEUE OK]", job.to);
    } catch (err) {
      console.error("[QUEUE FAIL]", err);

      const attempts = job.attempts || 0;

      if (attempts < 3) {
        const delay = getBackoff(attempts);

        console.log("[RETRY IN]", delay, "ms");

        setTimeout(async () => {
          await enqueueMessage({
            ...job,
            attempts: attempts + 1,
          });
        }, delay);
      } else {
        console.error("[QUEUE DROPPED]", job.to);
      }
    }

    await sleep(400); // 🔥 anti spam GLOBAL
    processed++;
  }

  return Response.json({ ok: true, processed });
}

// 🔥 BACKOFF (FUERA del catch)
function getBackoff(attempts) {
  if (attempts === 0) return 2000; // 2s
  if (attempts === 1) return 5000; // 5s
  if (attempts === 2) return 10000; // 10s
  return 15000;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
