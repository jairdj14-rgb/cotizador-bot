const URL = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

function clean(to) {
  return (to || "").replace(/\D/g, "");
}

export async function sendText(to, text) {
  await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: clean(to),
      type: "text",
      text: { body: text },
    }),
  });
}

export async function sendDocument(to, url) {
  await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: clean(to),
      type: "document",
      document: { link: url },
    }),
  });
}

export async function getMediaUrl(id) {
  const res = await fetch(`https://graph.facebook.com/v18.0/${id}`, {
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    },
  });
  const data = await res.json();
  return data.url;
}

export async function downloadMedia(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    },
  });
  return await res.arrayBuffer();
}
