import { redis, kUser } from "../../../../lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const waUser = searchParams.get("waUser");

    if (!waUser) {
      return new Response(JSON.stringify({ error: "Missing waUser param" }), {
        status: 400,
      });
    }

    const cleanWaUser = String(waUser).trim();

    const raw = await redis.get(kUser(cleanWaUser));

    let user = null;

    if (raw) {
      try {
        // 🔥 Soporta ambos casos (string o objeto)
        user = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch (err) {
        console.error("[debug-user parse error]", raw);

        user = {
          error: "Corrupted data in Redis",
          raw,
        };
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        waUser: cleanWaUser,
        exists: !!raw,
        user,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("[debug-user error]", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      { status: 500 },
    );
  }
}
