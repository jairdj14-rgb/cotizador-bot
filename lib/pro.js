const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// =========================
// FALLBACK SEGURO
// =========================
function fallback() {
  return {
    intro:
      "Se presenta la siguiente cotización basada en los requerimientos proporcionados.",
    alcances:
      "El servicio incluye la ejecución de los trabajos descritos con materiales y mano de obra necesarios.",
    limitaciones:
      "No incluye trabajos adicionales no especificados en esta cotización.",
    garantia:
      "Se garantiza el trabajo realizado bajo condiciones normales de uso.",
    notas:
      "Agradecemos su preferencia y quedamos a disposición para cualquier aclaración.",
  };
}

// =========================
// MAIN
// =========================
export async function generateProQuote(input) {
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 250,
        messages: [
          {
            role: "system",
            content: `Eres un profesional que redacta cotizaciones para servicios en general.

Responde SOLO JSON válido:

{
  "intro": "",
  "alcances": "",
  "limitaciones": "",
  "garantia": "",
  "notas": ""
}`,
          },
          {
            role: "user",
            content: input,
          },
        ],
      }),
    });

    // 🔥 ERROR HTTP (saldo, auth, etc)
    if (!res.ok) {
      console.error("OPENAI HTTP ERROR:", res.status);
      return fallback();
    }

    const data = await res.json();

    let text = data.choices?.[0]?.message?.content;

    if (!text) {
      console.error("OPENAI EMPTY RESPONSE");
      return fallback();
    }

    // limpiar basura
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error("JSON PARSE ERROR:", parseError);
      return fallback();
    }
  } catch (err) {
    console.error("OPENAI FATAL ERROR:", err);

    // 🔥 NO rompe el flujo
    return fallback();
  }
}
