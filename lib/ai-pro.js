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
        model: "gpt-4o-mini",
        temperature: 0.4, // 🔥 más estable = menos tokens basura
        messages: [
          {
            role: "system",
            content: `Responde SOLO JSON válido sin texto extra.

{
 "items": [],
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

    const data = await res.json();

    let text = data.choices?.[0]?.message?.content || "";

    // 🔥 limpiar basura
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(text);
  } catch (err) {
    console.error("AI ERROR:", err);
    return null;
  }
}
