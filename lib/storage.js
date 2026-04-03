import { put } from "@vercel/blob";

export async function uploadFile(buffer, filename, type = "application/pdf") {
  const blob = await put(filename, buffer, {
    access: "public",
    contentType: type,
  });

  return blob.url;
}
