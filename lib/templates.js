import { redis } from "./redis";

// =========================
// PLANTILLAS DEFAULT
// =========================
export const defaultTemplates = {
  baño: [
    { name: "Instalación lavabo", price: 1500 },
    { name: "Llave", price: 800 },
    { name: "Mano de obra", price: 1200 },
  ],
  electricidad: [
    { name: "Cambio foco", price: 50 },
    { name: "Cableado", price: 300 },
    { name: "Mano de obra", price: 500 },
  ],
};

// =========================
// GET USER TEMPLATES
// =========================
export async function getTemplates(phone) {
  return (await redis.get(`tpl:${phone}`)) || {};
}

// =========================
// SAVE TEMPLATE
// =========================
export async function saveTemplate(phone, name, items) {
  const key = `tpl:${phone}`;
  const templates = (await redis.get(key)) || {};

  templates[name] = items;

  await redis.set(key, templates);
}
