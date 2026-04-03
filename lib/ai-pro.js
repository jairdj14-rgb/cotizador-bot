const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export async function generateProQuote(input) {
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // 🔥 barato
        messages: [
          {
            role: "system",
            content: `Eres un experto técnico que genera cotizaciones profesionales.

Devuelve JSON válido con:

{
  "items": [{ "name": "", "price": 0 }],
  "intro": "",
  "alcances": "",
  "limitaciones": "",
  "garantia": "",
  "notas": ""
}

Precios realistas en MXN.
No texto fuera del JSON.`,
          },
          {
            role: "user",
            content: input,
          },
        ],
        temperature: 0.7,
      }),
    });

    const data = await res.json();

    const text = data.choices?.[0]?.message?.content;

    return JSON.parse(text);
  } catch (err) {
    console.error("AI ERROR:", err);
    return null;
  }
}
