// =========================
// 📱 NORMALIZADOR GLOBAL
// =========================

export function normalizePhone(raw = "") {
  let phone = String(raw).trim();

  // Quitar todo lo que no sea número
  phone = phone.replace(/\D/g, "");

  // =========================
  // FIX MÉXICO (WhatsApp bug)
  // =========================
  // WhatsApp envía 521... pero el número real es 52...
  if (phone.startsWith("521")) {
    phone = "52" + phone.slice(3);
  }

  // =========================
  // EXTRA: quitar ceros raros al inicio
  // =========================
  phone = phone.replace(/^0+/, "");

  return phone;
}
