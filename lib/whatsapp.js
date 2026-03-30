const API_URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

export async function enviarTexto(to, text) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    const data = await res.json();
    console.log("📤 TEXT OK:", to);
  } catch (err) {
    console.error("❌ ERROR TEXTO:", err);
  }
}

export async function enviarDocumento(to, url) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: {
          link: url,
          filename: "cotizacion.pdf",
        },
      }),
    });

    const data = await res.json();
    console.log("📄 DOC OK:", to);
  } catch (err) {
    console.error("❌ ERROR DOC:", err);
  }
}
