import {
  getState,
  setState,
  clearState,
  getUser,
  saveUser,
  redis,
} from "./redis";
import { generatePDF } from "./pdf";
import { uploadFile } from "./storage";
import { saveHistory, getHistory, updateStatus } from "./history";
import { enqueueMessage } from "./queue";

//  SAFE USER PARSE
async function getUserSafe(user) {
  const raw = await getUser(user);

  if (!raw) return {};

  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error("[getUserSafe error]", raw);
    return {};
  }
}

// =========================

function clean(t = "") {
  return String(t).trim().toLowerCase();
}

function isNumber(n) {
  return !isNaN(n) && n !== "" && n !== null;
}

function calcTotal(items = []) {
  return items.reduce((s, i) => s + i.total, 0);
}
function parseItemsBulk(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];

  for (const line of lines) {
    // soporta tabs, comas o espacios
    const parts = line.split(/\t|,|\s+/).filter(Boolean);

    if (parts.length < 3) continue;

    const qty = Number(parts[0]);
    const price = Number(parts[parts.length - 1]);
    const name = parts.slice(1, -1).join(" ");

    if (isNaN(qty) || isNaN(price)) continue;

    items.push({
      name,
      qty,
      unit: null,
      price,
      total: qty * price,
    });
  }

  return items;
}

function buildReminder(hist = []) {
  const pendientes = hist
    .map((h, i) => ({ ...h, index: i }))
    .filter((h) => h.status === "pendiente");

  if (!pendientes.length) return null;

  const list = pendientes
    .slice(0, 3)
    .map((h, i) => `${i + 1}. $${h.total}`)
    .join("\n");

  return `⏰ Recordatorio

Tienes ${pendientes.length} cotización(es) pendiente(s):

${list}

Escribe 2 para ver historial`;
}

function mainMenu(user) {
  const isPro = user.plan?.toLowerCase() === "pro";
  const credits = user.credits || 0;

  return `👋 Hola Vamos a cotizar

✅ Te recomiendo empezar aquí:
Presiona 1 y envia el mensaje
  💰 Créditos: ${credits}

1. Nueva cotización
2. Historial ${isPro ? "" : "🔒"}
3. Control de pagos ${isPro ? "" : "🔒"}
4. Referidos 🎁
5. Personalizar PDF ${isPro ? "" : "🔒"}
6. Ver mi plan

Escribe cancelar en cualquier momento para volver al menú.`;
}

function resumen(d) {
  return `📄 RESUMEN

Cliente: ${d.cliente}
Ubicación: ${d.ubicacion}
Items: ${d.items.length}
Total: $${d.total}
IVA: ${d.iva ? "Sí" : "No"}
Anticipo: $${d.anticipo} (${d.anticipo_pct}%)
Garantía: ${d.garantia} días

1 Confirmar
2 Editar cliente
3 Editar ubicación
4 Editar items
5 Editar anticipo
6 Editar garantía
7 Editar IVA
8 Cancelar`;
}

// =========================
export async function flow(user, raw) {
  const txt = clean(raw);
  // =========================
  //  REFERIDOS
  // =========================
  if (txt.startsWith("ref:")) {
    const refUser = txt.split(":")[1];

    if (refUser && refUser !== user) {
      try {
        const owner = await getUserSafe(refUser);

        // evitar duplicados
        owner.refs = owner.refs || [];

        if (!owner.refs.includes(user)) {
          owner.refs.push(user);

          //  sumar créditos
          owner.credits = (owner.credits || 0) + 2;

          await saveUser(refUser, owner);

          return "🎉 Has usado un link de referido\n\nEl dueño ganó +2 cotizaciones gratis 🚀";
        } else {
          return "⚠️ Ya usaste este referido";
        }
      } catch (e) {
        console.log("[REF ERROR]", e);
      }
    }
  }

  let state = (await getState(user)) || {};
  let userData = await getUserSafe(user);
  //  INIT MENU
  if (!state.step) {
    state.step = "menu";
    await setState(user, state);
  }
  //  DEFAULT USER CONFIG

  if (!userData.plan) {
    userData.plan = "free";
  }

  if (userData.credits === undefined) {
    userData.credits = 3;
  }

  await saveUser(user, userData);
  // =========================
  //  REMINDER (SOFT)
  // =========================
  if (!userData?.reminded) {
    try {
      const hist = await getHistory(user);
      const reminder = buildReminder(hist);

      if (reminder) {
        userData.reminded = true;
        await saveUser(user, userData);

        return {
          text: reminder,
          next: mainMenu(userData),
        };
      } else {
        //  SI YA NO HAY PENDIENTES → RESET
        if (userData.reminded) {
          userData.reminded = false;
          await saveUser(user, userData);
        }
      }
    } catch (e) {
      console.log("[REMINDER ERROR]", e);
    }
  }

  // =========================
  if (txt === "cancelar") {
    await clearState(user); // RESET TOTAL

    const newState = { step: "menu" };
    await setState(user, newState);

    return mainMenu(userData);
  }
  // =========================
  // MENU
  // =========================
  if (state.step === "menu") {
    if (txt === "1") {
      if (userData.plan?.toLowerCase() !== "pro") {
        if ((userData.credits || 0) <= 0) {
          return `❌ No tienes cotizaciones disponibles

🚀 Activa PRO para cotizaciones ilimitadas por $149/mes

👉 ${process.env.APP_URL}/api/pay?user=${user}`;
        }
      }

      state = { step: "cot_cliente", data: { items: [] } };
      await setState(user, state);

      return "👤 Nombre del cliente:";
    }

    if (txt === "2") {
      if (userData.plan?.toLowerCase() !== "pro")
        return "🔒 Historial es PRO\n\n" + mainMenu(userData);

      const hist = await getHistory(user);
      if (!hist.length) return "Sin cotizaciones.\n\n" + mainMenu(userData);

      return (
        hist.map((h, i) => `${i + 1}. $${h.total} - ${h.status}`).join("\n") +
        "\n\nPara marcar pagado escribe: pagar y el # de la cotización (ej: pagar 1)\n\nEscribe cancelar para volver al menú"
      );
    }

    if (txt === "3") {
      if (userData.plan?.toLowerCase() !== "pro")
        return "🔒 Control de pagos es PRO\n\n" + mainMenu(userData);

      return "Para marcar pagado escribe: pagar y el # de la cotización (ej: pagar 1)\n\nEscribe cancelar para volver al menú";
    }

    if (txt.startsWith("pagar")) {
      const parts = txt.split(" ");
      const num = Number(parts[1]);

      if (!parts[1] || isNaN(num) || num <= 0) {
        return "❌ Escribe: pagar y el # de la Cotización (ej: pagar 1)";
      }

      const index = num - 1;

      const hist = await getHistory(user);

      if (!hist[index]) {
        return "❌ Cotización no encontrada";
      }

      await updateStatus(user, index, "pagado");
      //  reset reminder si ya no hay pendientes
      const updatedHist = await getHistory(user);
      const stillPending = updatedHist.some((h) => h.status === "pendiente");

      if (!stillPending) {
        userData.reminded = false;
        await saveUser(user, userData);
      }

      return `✅ Cotización #${num} marcada como pagada\n\n${mainMenu(userData)}`;
    }

    if (txt === "4") {
      return `🎁 REFERIDOS

Refiere a tus compañeros y gana +2 cotizaciones GRATIS

Solo debes reenviar este mensaje y listo:

https://wa.me/5212212239301?text=ref:${user}

Escribe cancelar para volver al menú`;
    }

    if (txt === "5") {
      if (userData.plan?.toLowerCase() !== "pro")
        return "🔒 Personalización PDF es PRO\n\n" + mainMenu(userData);

      state.step = "brand_menu";
      await setState(user, state);

      return `🎨 Personalizar PDF

1 Nombre de empresa
2 Color (HEX)
3 Logo (imagen)
4 Ver configuración
5 Volver
6 Teléfono
7 Sitio Web
8 Email`;
    }

    if (txt === "6") {
      return `🚀 PLAN ${userData.plan.toUpperCase()}

Incluye:
• PDF personalizado
• Historial
• Control de pagos
• Recordatorios de cotizaciones pendientes.

Escribe cancelar para volver al menú`;
    }

    await setState(user, { step: "menu" });
    return mainMenu(userData);
  }

  // =========================
  // EDITS
  // =========================
  if (state.step === "edit_cliente") {
    state.data.cliente = raw;
    state.step = "cot_confirm";
    await setState(user, state);
    return resumen(state.data);
  }

  if (state.step === "edit_ubicacion") {
    state.data.ubicacion = raw;
    state.step = "cot_confirm";
    await setState(user, state);
    return resumen(state.data);
  }

  if (state.step === "edit_anticipo") {
    if (!isNumber(raw)) return "❌ Anticipo inválido";

    const t = calcTotal(state.data.items);
    const anticipo = Number(raw);

    state.data.anticipo = anticipo;
    state.data.anticipo_pct = Math.round((anticipo / t) * 100);

    state.step = "cot_confirm";
    await setState(user, state);
    return resumen(state.data);
  }

  if (state.step === "edit_garantia") {
    if (!isNumber(raw)) return "❌ Número inválido";

    state.data.garantia = raw;
    state.step = "cot_confirm";
    await setState(user, state);
    return resumen(state.data);
  }
  if (state.step === "edit_iva") {
    state.data.iva = txt === "1";
    state.step = "cot_confirm";
    await setState(user, state);
    return resumen(state.data);
  }
  // =========================
  // BRANDING MENU
  // =========================
  if (state.step === "brand_menu") {
    if (txt === "1") {
      state.step = "brand_name";
      await setState(user, state);
      return "Nombre de tu empresa:";
    }

    if (txt === "2") {
      state.step = "brand_color";
      await setState(user, state);
      return "Color HEX (ej: #0F172A):";
    }

    if (txt === "3") {
      state.step = "brand_logo";
      await setState(user, state);
      return "📷 Envía tu logo como imagen:";
    }

    if (txt === "4") {
      const brand = userData.brand || {};

      return `🎨 Tu configuración:

Nombre: ${brand.name || "No definido"}
Color: ${brand.color || "No definido"}
Logo: ${brand.logo ? "✅ Logo cargado" : "No definido"}

5 Volver`;
    }

    if (txt === "5") {
      state.step = "menu";
      await setState(user, state);
      return mainMenu(userData);
    }
    if (txt === "6") {
      state.step = "brand_phone";
      await setState(user, state);
      return "📞 Teléfono de tu empresa:";
    }

    if (txt === "7") {
      state.step = "brand_web";
      await setState(user, state);
      return "🌐 Sitio web:";
    }

    if (txt === "8") {
      state.step = "brand_email";
      await setState(user, state);
      return "✉️ Email:";
    }

    return "Elige opción válida";
  }
  if (state.step === "brand_name") {
    state.brand = state.brand || {};
    state.brand.name = raw;

    //  guardar en usuario
    userData.brand = {
      ...(userData.brand || {}),
      name: raw,
    };
    await saveUser(user, userData);

    state.step = "brand_menu";
    await setState(user, state);

    return {
      text: "✅ Nombre guardado",
      next: `🎨 Personalizar PDF

1 Nombre de empresa
2 Color (HEX)
3 Logo (imagen)
4 Ver configuración
5 Volver
6 Teléfono
7 Sitio Web
8 Email`,
    };
  }

  if (state.step === "brand_color") {
    state.brand = state.brand || {};
    state.brand.color = raw;

    //  guardar en usuario
    userData.brand = {
      ...(userData.brand || {}),
      color: raw,
    };
    await saveUser(user, userData);

    state.step = "brand_menu";
    await setState(user, state);

    return {
      text: "✅ Color guardado",
      next: `🎨 Personalizar PDF

1 Nombre de empresa
2 Color (HEX)
3 Logo (imagen)
4 Ver configuración
5 Volver
6 Teléfono
7 Sitio Web
8 Email`,
    };
  }
  if (state.step === "brand_logo") {
    state.brand = state.brand || {};

    // ✅ fallback URL
    if (raw.startsWith("http")) {
      state.brand.logo = raw;

      state.step = "brand_menu";
      await setState(user, state);
      return {
        text: "✅ Logo guardado",
        next: `🎨 Personalizar PDF

1 Nombre de empresa
2 Color (HEX)
3 Logo (imagen)
4 Ver configuración
5 Volver
6 Teléfono
7 Sitio Web
8 Email`,
      };
    }

    return "📷 Esperando imagen o URL del logo...";
  }
  if (state.step === "brand_phone") {
    userData.brand = {
      ...(userData.brand || {}),
      phone: raw,
    };
    await saveUser(user, userData);

    state.step = "brand_menu";
    await setState(user, state);

    return {
      text: "✅ Teléfono guardado",
      next: `🎨 Personalizar PDF

1 Nombre de empresa
2 Color (HEX)
3 Logo (imagen)
4 Ver configuración
5 Volver
6 Teléfono
7 Sitio Web
8 Email`,
    };
  }

  if (state.step === "brand_web") {
    userData.brand = {
      ...(userData.brand || {}),
      web: raw,
    };
    await saveUser(user, userData);

    state.step = "brand_menu";
    await setState(user, state);

    return {
      text: "✅ Sitio Web guardado",
      next: `🎨 Personalizar PDF

1 Nombre de empresa
2 Color (HEX)
3 Logo (imagen)
4 Ver configuración
5 Volver
6 Teléfono
7 Sitio Web
8 Email`,
    };
  }

  if (state.step === "brand_email") {
    userData.brand = {
      ...(userData.brand || {}),
      email: raw,
    };
    await saveUser(user, userData);

    state.step = "brand_menu";
    await setState(user, state);

    return {
      text: "✅ Email guardado",
      next: `🎨 Personalizar PDF

1 Nombre de empresa
2 Color (HEX)
3 Logo (imagen)
4 Ver configuración
5 Volver
6 Teléfono
7 Sitio Web
8 Email`,
    };
  }

  //  EDIT ITEMS (AISLADO Y SEGURO)

  if (state.step === "edit_items_menu") {
    // EDITAR ITEM
    if (isNumber(raw)) {
      const index = Number(raw) - 1;

      if (!state.data.items[index]) return "❌ Número inválido";

      state.editIndex = index;
      state.step = "edit_item_field";
      await setState(user, state);

      return `Editar item: ${state.data.items[index].name}

1 nombre
2 unidad
3 precio
4 cantidad`;
    }

    if (txt === "agregar") {
      state.step = "edit_item_new_name";
      await setState(user, state);
      return "🧾 Nuevo producto o servicio:";
    }

    if (txt === "volver") {
      state.step = "cot_confirm";
      await setState(user, state);
      return resumen(state.data);
    }

    return "Escribe un número, agregar o volver";
  }
  if (state.step === "edit_item_field") {
    if (txt === "1") {
      state.step = "edit_item_name";
      await setState(user, state);
      return "Nuevo nombre:";
    }

    if (txt === "2") {
      state.step = "edit_item_unit";
      await setState(user, state);
      return "Nueva unidad (Pieza, servicio, Mts, etc):";
    }

    if (txt === "3") {
      state.step = "edit_item_price";
      await setState(user, state);
      return "💰 Nuevo precio unitario:";
    }

    if (txt === "4") {
      state.step = "edit_item_qty";
      await setState(user, state);
      return "Nueva cantidad:";
    }

    return "Opción inválida";
  }
  // =========================
  // AGREGAR ITEM DESDE EDIT
  // =========================

  if (state.step === "edit_item_new_name") {
    state.data.current = { name: raw };
    state.step = "edit_item_unit_new";
    await setState(user, state);
    return "Unidad (Pieza, servicio, Mts, etc):";
  }

  if (state.step === "edit_item_unit_new") {
    state.data.current.unit = raw;
    state.step = "edit_item_price_new";
    await setState(user, state);
    return "💰 Precio unitario:";
  }

  if (state.step === "edit_item_price_new") {
    if (!isNumber(raw)) return "❌ Precio inválido";

    state.data.current.price = Number(raw);
    state.step = "edit_item_qty_new";
    await setState(user, state);
    return "Cantidad:";
  }

  if (state.step === "edit_item_qty_new") {
    if (!isNumber(raw)) return "❌ Número inválido";

    const item = {
      ...state.data.current,
      qty: Number(raw),
      total: state.data.current.price * Number(raw),
    };

    state.data.items.push(item);
    state.data.total = calcTotal(state.data.items);

    if (state.data.anticipo_pct) {
      state.data.anticipo = Math.round(
        (state.data.total * state.data.anticipo_pct) / 100,
      );
    }

    state.step = "edit_items_menu";
    await setState(user, state);

    const list = state.data.items
      .map(
        (i, idx) =>
          `${idx + 1}. ${i.name} (${i.qty}${i.unit ? " " + i.unit : ""}) - $${i.price}`,
      )
      .join("\n");

    return `🧾 Editar items

${list || "Sin items"}

Escribe el número para editar
O escribe:
agregar → nuevo item
volver → regresar`;
  }
  if (
    state.step === "edit_item_name" ||
    state.step === "edit_item_unit" ||
    state.step === "edit_item_price" ||
    state.step === "edit_item_qty"
  ) {
    const item = state.data.items[state.editIndex];

    if (state.step === "edit_item_name") item.name = raw;
    if (state.step === "edit_item_unit") item.unit = raw;

    if (state.step === "edit_item_price") {
      if (!isNumber(raw)) return "❌ Precio inválido";
      item.price = Number(raw);
    }

    if (state.step === "edit_item_qty") {
      if (!isNumber(raw)) return "❌ Número inválido";
      item.qty = Number(raw);
    }

    item.total = item.price * item.qty;

    state.data.total = calcTotal(state.data.items);

    if (state.data.anticipo_pct) {
      state.data.anticipo = Math.round(
        (state.data.total * state.data.anticipo_pct) / 100,
      );
    }
    state.step = "edit_items_menu";
    await setState(user, state);

    const list = state.data.items
      .map(
        (i, idx) =>
          `${idx + 1}. ${i.name} (${i.qty}${i.unit ? " " + i.unit : ""}) - $${i.price}`,
      )
      .join("\n");

    return `🧾 Editar items

${list || "Sin items"}

Escribe el número para editar
O escribe:
agregar → nuevo item
volver → regresar`;
  }

  // =========================
  // FLUJO
  // =========================

  if (state.step === "cot_cliente") {
    state.data.cliente = raw;
    state.step = "cot_ubicacion";
    await setState(user, state);
    return "📍 Ubicación donde se realizará el trabajo/servicio:";
  }

  if (state.step === "cot_ubicacion") {
    state.data.ubicacion = raw;
    state.step = "cot_item";
    await setState(user, state);
    return `🧾 Agrega tus productos:

Puedes hacerlo de 2 formas:

1️⃣ Rápido (recomendado):
Ejemplo:
2 martillos 350
1 puerta 1500
3 tornillos 20

(Puedes pegar varios en líneas)

2️⃣ Paso a paso:
Escribe solo el nombre del producto

👇 Escribe tu producto o pega la lista`;
  }

  if (state.step === "cot_item") {
    // =========================
    // 🔥 BULK INPUT
    // =========================
    if (raw.includes("\n") || /^\d+\s+.+\s+\d+(\.\d+)?$/.test(raw)) {
      const items = parseItemsBulk(raw);

      if (items.length > 0) {
        state.data.items.push(...items);
        state.data.total = calcTotal(state.data.items);

        state.step = "cot_more";
        await setState(user, state);

        return `✅ ${items.length} productos agregados

📦 Ejemplo:
${items.map((i, idx) => `${idx + 1}. ${i.name} - $${i.price}`).join("\n")}

Subtotal: $${state.data.total}
También puedes pegar más productos 👇
¿Agregar otro? (si/no)`;
      }
    }

    // =========================
    // 🔁 FLUJO NORMAL
    // =========================
    state.data.current = { name: raw };
    state.step = "cot_qty";
    await setState(user, state);
    return "Cantidad:";
  }

  if (state.step === "cot_qty") {
    if (!isNumber(raw)) return "❌ Número inválido";

    state.data.current.qty = Number(raw);

    //  saltamos unidad
    state.data.current.unit = null;

    state.step = "cot_price";
    await setState(user, state);
    return "💰 Precio unitario:";
  }

  if (state.step === "cot_unit") {
    state.data.current.unit = raw;
    state.step = "cot_price";
    await setState(user, state);
    return "💰 Precio unitario:";
  }

  if (state.step === "cot_price") {
    if (!isNumber(raw)) return "❌ Precio inválido";

    const price = Number(raw);

    const item = {
      ...state.data.current,
      unit: state.data.current.unit || null,
      price,
      total: price * state.data.current.qty,
    };

    state.data.items.push(item);
    state.data.total = calcTotal(state.data.items);

    //  ANTICIPO INTELIGENTE
    if (state.data.anticipo_pct) {
      state.data.anticipo = Math.round(
        (state.data.total * state.data.anticipo_pct) / 100,
      );
    }

    state.step = "cot_more";
    await setState(user, state);

    return `Subtotal: $${state.data.total}

¿Agregar otro? (si/no)`;
  }

  if (state.step === "cot_more") {
    if (txt === "si") {
      state.step = "cot_item";
      await setState(user, state);
      return "Producto:";
    }

    //   ANTICIPO
    if (state.editingItems) {
      state.editingItems = false;

      if (state.data.anticipo_pct) {
        state.data.anticipo = Math.round(
          (state.data.total * state.data.anticipo_pct) / 100,
        );
      }

      state.step = "cot_confirm";
      await setState(user, state);
      return `📄 PREVISUALIZACIÓN

${resumen(state.data)}

✏️ Puedes editar:
- precio 1 500
- cantidad 2 3
- eliminar 1

O confirma 👇`;
    }

    state.step = "cot_iva";
    await setState(user, state);
    return "¿Incluir IVA a la cotización?\n1 Sí\n2 No";
  }

  if (state.step === "cot_iva") {
    state.data.iva = txt === "1";
    state.step = "cot_anticipo";
    await setState(user, state);
    return "¿Cuánto quieres pedir de anticipo? (en dinero)";
  }

  if (state.step === "cot_anticipo") {
    if (!isNumber(raw)) return "❌ Anticipo inválido";

    const t = calcTotal(state.data.items);
    const anticipo = Number(raw);

    state.data.total = t;
    state.data.anticipo = anticipo;
    state.data.anticipo_pct = Math.round((anticipo / t) * 100);

    state.step = "cot_garantia";
    await setState(user, state);

    return "Garantía (días):";
  }

  if (state.step === "cot_garantia") {
    if (!isNumber(raw)) return "❌ Número inválido";

    state.data.garantia = raw;
    state.step = "cot_confirm";
    await setState(user, state);

    return resumen(state.data);
  }

  // =========================
  // CONFIRM
  // =========================
  if (state.step === "cot_confirm") {
    // =========================
    // ✏️ EDICIÓN RÁPIDA
    // =========================

    if (txt.startsWith("precio")) {
      const [, index, value] = txt.split(" ");
      const i = Number(index) - 1;
      const v = Number(value);

      if (state.data.items[i] && !isNaN(v)) {
        state.data.items[i].price = v;
        state.data.items[i].total = v * state.data.items[i].qty;
        state.data.total = calcTotal(state.data.items);

        await setState(user, state);
        return resumen(state.data);
      }
    }

    if (txt.startsWith("cantidad")) {
      const [, index, value] = txt.split(" ");
      const i = Number(index) - 1;
      const v = Number(value);

      if (state.data.items[i] && !isNaN(v)) {
        state.data.items[i].qty = v;
        state.data.items[i].total = v * state.data.items[i].price;
        state.data.total = calcTotal(state.data.items);

        await setState(user, state);
        return resumen(state.data);
      }
    }

    if (txt.startsWith("eliminar")) {
      const [, index] = txt.split(" ");
      const i = Number(index) - 1;

      if (state.data.items[i]) {
        state.data.items.splice(i, 1);
        state.data.total = calcTotal(state.data.items);

        await setState(user, state);
        return resumen(state.data);
      }
    }
    if (txt === "1") {
      const isPro = userData.plan?.toLowerCase() === "pro";

      if (!isPro && (userData.credits || 0) <= 0) {
        return `❌ No tienes cotizaciones disponibles

🚀 Activa PRO para cotizaciones ilimitadas por $144/mes

👉 ${process.env.APP_URL}/api/pay?user=${user}`;
      }
      const resultKey = `confirm:result:${user}`;
      const lockKey = `lock:confirm:${user}`;

      // idempotencia REAL
      const existing = await redis.get(resultKey);
      if (existing) {
        console.log("[CONFIRM ALREADY PROCESSED]");
        return "__queued__";
      }
      //  lock
      const isLocked = await redis.get(lockKey);
      if (isLocked) {
        console.log("[CONFIRM IN PROGRESS]");
        return "__queued__";
      }

      await redis.set(lockKey, "1", { ex: 30 });
      try {
        console.log("[CONFIRM START]", {
          user,
        });

        const pdf = await generatePDF({
          ...state.data,
          brand: userData?.brand || {},
        });

        const filename = `cotizacion-${Date.now()}.pdf`;
        let url;

        try {
          url = await uploadFile(pdf, filename);
        } catch (err) {
          console.error("[UPLOAD ERROR]", err);
        }

        if (!url) {
          console.error("[PDF ERROR] URL not generated");
          await redis.del(lockKey);
          return "❌ Error subiendo el PDF";
        }

        await saveHistory(user, {
          ...state.data,
          status: "pendiente",
          pdfUrl: url,
          createdAt: Date.now(),
        });

        // CONSUMIR CRÉDITO
        if (!isPro) {
          userData.credits -= 1;
          await saveUser(user, userData);
        }
        await enqueueMessage({
          to: user,
          plan: userData.plan,
          response: {
            text: `📄 *¡Tu cotización está lista!*

⚠️ Este archivo estará disponible por *7 días*
Te recomendamos descargarlo o guardarlo 📥

💼 Ya puedes enviarla a tu cliente o continuar trabajando desde el menú 👇`,
            url,
            next: mainMenu(userData),
          },
        });
        // Marcar procesado
        await redis.set(resultKey, "1", { ex: 300 });

        //  METRICAS
        const today = new Date().toLocaleDateString("en-CA");

        await redis.incr("metrics:pdf_generated");
        await redis.incr(`metrics:pdf:${today}`);

        // Limpiar estado
        await clearState(user);
        await redis.del(lockKey);

        return "__queued__";
      } catch (err) {
        console.error("[PDF ERROR]", err);
        await redis.del(lockKey);
        return "❌ Error generando PDF";
      }
    }

    //  EDICIONES (FUERA DEL RETURN)
    if (txt === "2") {
      state.step = "edit_cliente";
      await setState(user, state);
      return "Nuevo cliente:";
    }

    if (txt === "3") {
      state.step = "edit_ubicacion";
      await setState(user, state);
      return "Nueva ubicación:";
    }

    if (txt === "4") {
      state.step = "edit_items_menu";
      await setState(user, state);

      const list = state.data.items
        .map(
          (i, idx) =>
            `${idx + 1}. ${i.name} (${i.qty}${i.unit ? " " + i.unit : ""}) - $${i.price}`,
        )
        .join("\n");

      return `🧾 Editar items

${list || "Sin items"}

Escribe el número para editar
O escribe:
agregar → nuevo item
volver → regresar`;
    }

    if (txt === "5") {
      state.step = "edit_anticipo";
      await setState(user, state);
      return "Nuevo anticipo:";
    }

    if (txt === "6") {
      state.step = "edit_garantia";
      await setState(user, state);
      return "Nueva garantía:";
    }

    if (txt === "7") {
      state.step = "edit_iva";
      await setState(user, state);
      return "¿IVA?\n1 Sí\n2 No";
    }

    if (txt === "8") {
      await setState(user, { step: "menu" });
      return mainMenu(userData);
    }

    return resumen(state.data);
  }
}
