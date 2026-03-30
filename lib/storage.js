import { put } from "@vercel/blob";

export async function subirPDF(buffer, filename) {
  // 🔍 DEBUG TOKEN
  console.log("🧪 BLOB TOKEN:", process.env.BLOB_READ_WRITE_TOKEN);

  try {
    const blob = await put(filename, buffer, {
      access: "public",
    });

    console.log("✅ PDF subido:", blob.url);

    return blob.url;
  } catch (err) {
    console.error("❌ ERROR SUBIENDO PDF:", err);
    throw err;
  }
}
