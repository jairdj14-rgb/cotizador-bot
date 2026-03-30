import { redis } from "./redis";

function parseNumero(text) {
  const limpio = text.replace(/[^0-9.]/g, "");
  if (!limpio) return null;
  if (!/^[0-9]+(\.[0-9]+)?$/.test(limpio)) return null;
  return limpio;
}

function menuPrincipal() {
  return `
¿Qué deseas hacer ahora?

1. Nueva cotización
2. Ver historial
3. Actualizar estado (pagado / anticipo)
`;
}

function generarResumen(state) {
  return `
Resumen:

1. Cliente: ${state.cliente}
2. Trabajo: ${state.trabajo}
3. Ubicación: ${state.ubicacion}
4. IVA: ${state.iva === "si" ? "Sí" : "No"}
5. Precio: ${state.precio}
6. Garantía: ${state.garantia} días
7. Anticipo: ${state.anticipo}
8. Reporte: ${state.reporte === "si" ? "Sí" : "No"}

Responde con el número a editar o 9 para confirmar
`;
}

function generarCotizacionTexto(state) {
  const precio = Number(state.precio).toLocaleString("es-MX");

  return `
COTIZACIÓN

Cliente: ${state.cliente}
Trabajo: ${state.trabajo}
Ubicación: ${state.ubicacion}

Precio: $${precio}
IVA: ${state.iva === "si" ? "Incluido" : "No incluido"}
Garantía: ${state.garantia} días
Anticipo: ${state.anticipo}

Gracias por tu preferencia

Este formato es básico

Versión PRO disponible:
- PDF profesional
- Reporte técnico automático
- Agrega tu logo y colores

Escribe PRO
`;
}

export async function manejarFlujo(from, text) {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  if (!clean) return null;

  let state = (await redis.get(from)) || {};
  let step = state.step || "inicio";

  switch (step) {
    // ---------------- MENU ----------------
    case "menu":
      if (clean === "1") {
        await redis.del(from);
        return "¿Nombre del cliente?";
      }

      if (clean === "2") {
        return "__HISTORIAL__";
      }

      if (clean === "3") {
        return "__ACTUALIZAR_ESTADO__";
      }

      return menuPrincipal();

    // ---------------- INICIO ----------------
    case "inicio":
      state = { step: "cliente" };
      await redis.set(from, state);
      return "¿Nombre del cliente?";

    case "cliente":
      state.cliente = clean;
      state.step = "trabajo";
      await redis.set(from, state);
      return "¿Trabajo?";

    case "trabajo":
      state.trabajo = clean;
      state.step = "ubicacion";
      await redis.set(from, state);
      return "¿Ubicación?";

    case "ubicacion":
      state.ubicacion = clean;
      state.step = "iva";
      await redis.set(from, state);
      return "¿IVA? (sí/no)";

    case "iva":
      if (!["si", "sí", "no"].includes(lower)) return "Responde sí/no";
      state.iva = lower === "sí" ? "si" : lower;
      state.step = "precio";
      await redis.set(from, state);
      return "¿Precio?";

    case "precio": {
      const n = parseNumero(clean);
      if (!n) return "Número inválido";
      state.precio = n;
      state.step = "garantia";
      await redis.set(from, state);
      return "¿Garantía?";
    }

    case "garantia": {
      const n = parseNumero(clean);
      if (!n) return "Número inválido";
      state.garantia = n;
      state.step = "anticipo";
      await redis.set(from, state);
      return "¿Anticipo?";
    }

    case "anticipo": {
      const n = parseNumero(clean);
      if (!n) return "Número inválido";
      state.anticipo = n;
      state.step = "reporte";
      await redis.set(from, state);
      return "¿Deseas agregar reporte profesional? (solo versión PRO)";
    }

    case "reporte":
      if (!["si", "sí", "no"].includes(lower)) return "Responde sí/no";
      state.reporte = lower === "sí" ? "si" : lower;
      state.step = "confirmacion";
      await redis.set(from, state);
      return generarResumen(state);

    case "confirmacion": {
      const mapa = {
        1: "cliente",
        2: "trabajo",
        3: "ubicacion",
        4: "iva",
        5: "precio",
        6: "garantia",
        7: "anticipo",
        8: "reporte",
      };

      if (clean === "9") {
        state.step = "menu";
        await redis.set(from, state);

        return generarCotizacionTexto(state) + "\n\n" + menuPrincipal();
      }

      if (mapa[clean]) {
        state.step = "editando";
        state.editando = mapa[clean];
        await redis.set(from, state);
        return `Editar ${mapa[clean]}`;
      }

      return "Escribe 1-9";
    }

    case "editando": {
      const campo = state.editando;

      if (campo === "iva" || campo === "reporte") {
        if (!["si", "sí", "no"].includes(lower)) return "Responde sí/no";
        state[campo] = lower === "sí" ? "si" : lower;
      } else if (["precio", "garantia", "anticipo"].includes(campo)) {
        const n = parseNumero(clean);
        if (!n) return "Número inválido";
        state[campo] = n;
      } else {
        state[campo] = clean;
      }

      state.step = "confirmacion";
      delete state.editando;

      await redis.set(from, state);

      return generarResumen(state);
    }

    default:
      await redis.del(from);
      return "¿Nombre del cliente?";
  }
}
