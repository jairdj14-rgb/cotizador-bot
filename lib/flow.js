import { redis, kState, getUser, kUser } from "./redis";
import { generatePDF } from "./pdf";
import { uploadFile } from "./storage";
import { saveHistory, getHistory } from "./history";
import { suggestItems } from "./ai";
import { generateProQuote } from "./ai-pro";
import { createCheckoutUrl, getPlanLabel, getQuoteLimit } from "./stripe";

// =========================
// HELPERS
// =========================
function clean(t = "") {
  return String(t).trim().toLowerCase();
}

function num(t = "") {
  const n = Number(String(t).replace(/[^\d]/g, ""));
  return Number.isNaN(n) ? null : n;
}

function calcTotal(items = []) {
  return items.reduce((sum, i) => sum + (i.total || 0), 0);
}

function parseItem(text = "") {
  const parts = String(text).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  let qty = 1;

  const qtyIndex = parts.findIndex(
    (p) => /^x\d+$/i.test(p) || /^\d+x$/i.test(p),
  );

  if (qtyIndex !== -1) {
    const token = parts[qtyIndex].toLowerCase().replace("x", "");
    qty = Number(token);
    parts.splice(qtyIndex, 1);
  }

  const priceToken = parts.pop();
  const price = num(priceToken);
  const name = parts.join(" ").trim();

  if (!name || price === null || price <= 0 || !qty || qty <= 0) return null;

  return {
    name,
    price,
    qty,
    total: price * qty,
  };
}

function renderItems(items = []) {
  if (!items.length) return "Sin conceptos";
  return items
    .map((i, idx) => `${idx + 1}. ${i.name} x${i.qty} = $${i.total}`)
    .join("\n");
}

function menu() {
  return `👋 Bienvenido

1. Nueva cotización
2. Historial
3. Mi plan
4. Activar plan

💡 Tip:
"cotizar baño"
"pro instalación eléctrica"`;
}

function upgradeMenu() {
  return `💳 Activar plan

1. BASIC - $299/mes
2. PRO - $999/mes
0. Cancelar`;
}

function getDefaultUserData(data) {
  return {
    plan: data?.plan || "free",
    branding: data?.branding || {},
    billingStatus: data?.billingStatus || "inactive",
    stripeCustomerId: data?.stripeCustomerId || "",
    stripeSubscriptionId: data?.stripeSubscriptionId || "",
  };
}

function isAdminUser(user) {
  const admin = String(process.env.ADMIN_WHATSAPP_NUMBER || "").trim();
  return !!admin && String(user) === admin;
}

// =========================
// STATE
// =========================
async function getState(u) {
  return (await redis.get(kState(u))) || { step: "menu", data: {} };
}

async function setState(u, s) {
  await redis.set(kState(u), s);
}

async function getUserSafe(user) {
  const data = await getUser(user);
  return getDefaultUserData(data);
}

async function ensureAdminBasic(user, userData) {
  if (!isAdminUser(user)) return userData;
  if (userData.plan === "basic") return userData;

  const next = {
    ...userData,
    plan: "basic",
    billingStatus: "active",
  };

  await redis.set(kUser(user), next);
  return next;
}

// =========================
// FLOW
// =========================
export async function flow(user, raw) {
  const rawText = String(raw || "");
  const txt = clean(rawText);

  let state = await getState(user);
  let userData = await getUserSafe(user);
  userData = await ensureAdminBasic(user, userData);

  // =========================
  // CANCEL
  // =========================
  if (txt === "cancelar" || txt === "0") {
    await redis.del(kState(user));
    return menu();
  }

  // =========================
  // MENU
  // =========================
  if (state.step === "menu") {
    if (txt === "1") {
      state = { step: "cliente", data: { items: [] } };
      await setState(user, state);
      return "👤 Nombre del cliente:";
    }

    if (txt === "2") {
      const history = (await getHistory(user)) || [];
      if (!history.length) return "Sin historial";

      return history
        .slice(-10)
        .reverse()
        .map((c) => `#${c.id} $${c.precio} (${c.status || "pendiente"})`)
        .join("\n");
    }

    if (txt === "3") {
      const history = (await getHistory(user)) || [];
      const used = history.length;
      const limit = getQuoteLimit(userData.plan);

      return `Plan: ${getPlanLabel(userData.plan)}
Cotizaciones usadas: ${used}${limit === Infinity ? "" : `/${limit}`}`;
    }

    if (txt === "4") {
      state = { step: "upgrade", data: {} };
      await setState(user, state);
      return upgradeMenu();
    }

    // IA simple
    if (txt.startsWith("cotizar")) {
      const items = suggestItems(txt);
      if (!items || !items.length) return 'No entendí. Ejemplo: "cotizar baño"';

      state = {
        step: "items",
        data: {
          cliente: "Cliente",
          items: items.map((i) => ({
            ...i,
            qty: i.qty || 1,
            total: (i.price || 0) * (i.qty || 1),
          })),
        },
      };

      await setState(user, state);

      return `🤖 Sugerido:

${renderItems(state.data.items)}

Puedes agregar más conceptos, editar, eliminar o escribir "listo"`;
    }

    // IA PRO
    if (txt.startsWith("pro ")) {
      if (userData.plan !== "pro") {
        return `🚫 La IA avanzada es solo para PRO

Escribe 4 para activar PRO.`;
      }

      const ai = await generateProQuote(txt);

      if (!ai || !Array.isArray(ai.items) || !ai.items.length) {
        return "Error IA. Intenta de nuevo o haz la cotización manual.";
      }

      state = {
        step: "confirm",
        data: {
          cliente: "Cliente",
          items: ai.items.map((i) => ({
            ...i,
            qty: i.qty || 1,
            total: (i.price || 0) * (i.qty || 1),
          })),
          ai,
          anticipo: 0,
          porcentaje: 0,
          iva: false,
        },
      };

      await setState(user, state);

      return `🤖 PRO:

${state.data.items.map((i) => `${i.name} x${i.qty} = $${i.total}`).join("\n")}

9 confirmar
0 cancelar`;
    }

    return menu();
  }

  // =========================
  // UPGRADE
  // =========================
  if (state.step === "upgrade") {
    try {
      if (txt === "1" || txt === "basic") {
        const url = await createCheckoutUrl({
          plan: "basic",
          waUser: user,
        });

        await redis.del(kState(user));

        return `🔵 BASIC - $299/mes

Paga aquí:
${url}`;
      }

      if (txt === "2" || txt === "pro") {
        const url = await createCheckoutUrl({
          plan: "pro",
          waUser: user,
        });

        await redis.del(kState(user));

        return `🔥 PRO - $999/mes

Paga aquí:
${url}`;
      }

      return upgradeMenu();
    } catch (error) {
      console.error("upgrade error", { user, error: error?.message });
      await redis.del(kState(user));
      return "No pude generar el link de pago. Intenta de nuevo en unos minutos.";
    }
  }

  // =========================
  // CLIENTE
  // =========================
  if (state.step === "cliente") {
    const cliente = rawText.trim();
    if (!cliente) return "Escribe el nombre del cliente.";

    state.data.cliente = cliente;
    state.step = "items";
    await setState(user, state);

    return `🛒 Agrega conceptos

Ejemplos:
foco 50
cable 100 x3

Comandos:
ver
eliminar 1
editar 1 300

Escribe "listo" para terminar`;
  }

  // =========================
  // ITEMS
  // =========================
  if (state.step === "items") {
    if (txt === "ver") {
      return `${renderItems(state.data.items)}

Total: $${calcTotal(state.data.items)}`;
    }

    if (txt === "listo") {
      if (!state.data.items || !state.data.items.length) {
        return "Agrega al menos un concepto antes de terminar.";
      }

      state.step = "anticipo";
      await setState(user, state);

      return `Total: $${calcTotal(state.data.items)}

Anticipo:
Ejemplo 500
Si no hay anticipo escribe 0`;
    }

    if (txt.startsWith("eliminar")) {
      const parts = txt.split(/\s+/);
      const idx = Number(parts[1]);

      if (!idx || idx < 1 || idx > state.data.items.length) {
        return "Índice inválido. Ejemplo: eliminar 1";
      }

      state.data.items.splice(idx - 1, 1);
      await setState(user, state);

      if (!state.data.items.length) {
        return "Concepto eliminado. Tu carrito está vacío.";
      }

      return `Eliminado

${renderItems(state.data.items)}

Total: $${calcTotal(state.data.items)}`;
    }

    if (txt.startsWith("editar")) {
      const parts = rawText.trim().split(/\s+/);
      const idx = Number(parts[1]);
      const price = num(parts[2]);

      if (
        !idx ||
        idx < 1 ||
        idx > state.data.items.length ||
        price === null ||
        price <= 0
      ) {
        return "Formato inválido. Ejemplo: editar 1 300";
      }

      state.data.items[idx - 1].price = price;
      state.data.items[idx - 1].total = price * state.data.items[idx - 1].qty;

      await setState(user, state);

      return `Actualizado

${renderItems(state.data.items)}

Total: $${calcTotal(state.data.items)}`;
    }

    const item = parseItem(rawText);
    if (!item) {
      return `Formato inválido

Ejemplos válidos:
foco 50
cable 100 x3`;
    }

    state.data.items.push(item);
    await setState(user, state);

    return `+ ${item.name}

${renderItems(state.data.items)}

Total: $${calcTotal(state.data.items)}`;
  }

  // =========================
  // ANTICIPO
  // =========================
  if (state.step === "anticipo") {
    const total = calcTotal(state.data.items);
    const anticipo = num(rawText);

    if (anticipo === null || anticipo < 0) {
      return "Escribe un anticipo válido. Ejemplo: 500";
    }

    if (anticipo > total) {
      return "El anticipo no puede ser mayor al total.";
    }

    state.data.anticipo = anticipo;
    state.data.porcentaje =
      total > 0 ? Math.round((anticipo / total) * 100) : 0;
    state.step = "iva";

    await setState(user, state);

    return `IVA
1 sí
2 no`;
  }

  // =========================
  // IVA
  // =========================
  if (state.step === "iva") {
    if (!["1", "2"].includes(txt)) {
      return `Responde:
1 sí
2 no`;
    }

    state.data.iva = txt === "1";
    state.step = "confirm";

    await setState(user, state);

    return `Resumen:

${renderItems(state.data.items)}

Total: $${calcTotal(state.data.items)}
Anticipo: $${state.data.anticipo || 0}
IVA: ${state.data.iva ? "Sí" : "No"}

9 confirmar
0 cancelar`;
  }

  // =========================
  // CONFIRM
  // =========================
  if (state.step === "confirm") {
    if (txt !== "9") {
      return `Escribe 9 para confirmar o 0 para cancelar.`;
    }

    const history = (await getHistory(user)) || [];
    const used = history.length;
    const limit = getQuoteLimit(userData.plan);

    if (used >= limit) {
      await redis.del(kState(user));

      return `🚫 Llegaste al límite de ${limit} cotizaciones en tu plan ${getPlanLabel(userData.plan)}.

Escribe 4 para activar BASIC o PRO.`;
    }

    const id = Date.now().toString().slice(-6);

    const data = {
      ...state.data,
      id,
      precio: calcTotal(state.data.items),
      status: (state.data.anticipo || 0) > 0 ? "anticipo" : "pendiente",
    };

    await saveHistory(user, data);

    const pdf = await generatePDF(data, userData.branding);
    const url = await uploadFile(pdf, `cotizacion-${id}.pdf`);

    await redis.del(kState(user));

    return {
      type: "pdf",
      url,
      text: `✅ Cotización #${id}

1 nueva
2 historial`,
    };
  }

  return menu();
}
