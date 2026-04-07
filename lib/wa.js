const BASE = "https://graph.facebook.com/v18.0";

const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;

// 🔥 VALIDACIÓN CONFIG
if (!PHONE_ID || !TOKEN) {
  console.error("[WA CONFIG MISSING]", {
    PHONE_ID,
    TOKEN: !!TOKEN,
  });
}

const URL = `${BASE}/${PHONE_ID}/messages`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clean(to) {
  if (!to) {
    console.error("[WA ERROR] número inválido:", to);
    return "";
  }
  return String(to).replace(/\D/g, "");
}

// =========================
// DEBUG CONFIG
// =========================
export async function debugWhatsAppConfig() {
  try {
    console.log("---- WA DEBUG START ----");
    console.log("PHONE_ID:", PHONE_ID);
    console.log("TOKEN (first 20):", TOKEN?.slice(0, 20));

    const res = await fetch(`${BASE}/${PHONE_ID}`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    });

    const data = await res.json();

    console.log("[WA PHONE DATA]", data);

    if (!res.ok) {
      console.error("[WA CONFIG ERROR]", data);
    } else {
      console.log("[WA CONFIG OK]");
    }

    console.log("---- WA DEBUG END ----");
  } catch (err) {
    console.error("[WA DEBUG FAIL]", err);
  }
}

// =========================
// SEND TEXT
// =========================
export async function sendText(to, text) {
  await sleep(50);

  const payload = {
    messaging_product: "whatsapp",
    to: clean(to),
    type: "text",
    text: { body: text },
  };

  if (!payload.to) {
    console.error("[WA INVALID TO TEXT]", to);
    return;
  }

  console.log("[WA SEND TEXT]", {
    to: payload.to,
    text,
    url: URL,
  });

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("[WA ERROR TEXT]", data);
  } else {
    console.log("[WA SUCCESS TEXT]", data);
  }

  return data;
}

// =========================
// SEND DOCUMENT
// =========================
export async function sendDocument(to, url) {
  await sleep(50);

  const payload = {
    messaging_product: "whatsapp",
    to: clean(to),
    type: "document",
    document: { link: url },
  };

  if (!payload.to) {
    console.error("[WA INVALID TO DOC]", to);
    return;
  }

  console.log("[WA SEND DOC]", {
    to: payload.to,
    url,
  });

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("[WA ERROR DOC]", data);
  } else {
    console.log("[WA SUCCESS DOC]", data);
  }

  return data;
}

// =========================
// MEDIA
// =========================
export async function getMediaUrl(id) {
  const res = await fetch(`${BASE}/${id}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  });

  const data = await res.json();
  return data.url;
}

export async function downloadMedia(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  });

  return await res.arrayBuffer();
}

// =========================
// SMART SEND (PRO)
// =========================
export async function sendMessage(to, response) {
  try {
    // 🔹 Caso 1: string simple
    if (typeof response === "string") {
      // 🔥 dividir en chunks si es muy largo (anti rate limit)
      const MAX = 1200;

      if (response.length <= MAX) {
        return await sendText(to, response);
      }

      const parts = [];
      for (let i = 0; i < response.length; i += MAX) {
        parts.push(response.slice(i, i + MAX));
      }

      console.log("[WA BATCH SEND]", parts.length, "parts");

      for (const part of parts) {
        await sendText(to, part);
        await sleep(1200); // 🔥 delay real anti rate limit
      }

      return;
    }

    // 🔹 Caso 2: PDF
    if (response?.url) {
      await sendText(to, response.text || "📄 Documento listo");

      await sleep(2000); // 🔥 clave

      await sendDocument(to, response.url);

      if (response.next) {
        await sleep(1500);
        await sendText(to, response.next);
      }

      return;
    }

    // 🔥 🔹 CASO FALTANTE (EL FIX)
    if (response?.text) {
      await sendText(to, response.text);

      if (response.next) {
        await sleep(300);
        await sendText(to, response.next);
      }

      return;
    }
    // fallback
    return await sendText(to, "⚠️ Error inesperado");
  } catch (err) {
    console.error("[WA SEND ERROR]", err);
  }
}
