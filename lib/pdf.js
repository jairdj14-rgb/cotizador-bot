import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// IA
async function generarContenidoIA(state) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `
Genera reporte técnico profesional.

Trabajo: ${state.trabajo}
Ubicación: ${state.ubicacion}

Devuelve JSON:
{
 "introduccion": "",
 "alcance": "",
 "recomendaciones": ""
}
`,
          },
        ],
      }),
    });

    const json = await res.json();
    return JSON.parse(json.choices[0].message.content);
  } catch {
    return {
      introduccion: "Servicio bajo condiciones estándar.",
      alcance: "Incluye ejecución del trabajo.",
      recomendaciones: "Mantenimiento recomendado.",
    };
  }
}

// helpers
function dinero(n) {
  return `$${Number(n).toLocaleString("es-MX")}`;
}

function hexToRgb(hex) {
  if (!hex) return rgb(0, 0, 0);
  const bigint = parseInt(hex.replace("#", ""), 16);
  return rgb(
    ((bigint >> 16) & 255) / 255,
    ((bigint >> 8) & 255) / 255,
    (bigint & 255) / 255,
  );
}

// principal
export async function generarPDF(state, options = {}) {
  const {
    tipo = "free",
    usarIA = false,
    branding = null,
    folio = null,
  } = options;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const color =
    tipo === "pro" ? hexToRgb(branding?.color || "#000") : rgb(0, 0, 0);

  // 🔹 HEADER CENTRADO (FREE mejorado)
  if (tipo === "free") {
    page.drawText("COTIZACIÓN", {
      x: 220,
      y: 780,
      size: 18,
      font: bold,
    });

    page.drawLine({
      start: { x: 50, y: 770 },
      end: { x: 545, y: 770 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
  }

  // 🔹 HEADER PRO
  if (tipo === "pro") {
    page.drawText("COTIZACIÓN PROFESIONAL", {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color,
    });

    if (folio) {
      page.drawText(folio, {
        x: 450,
        y: 780,
        size: 12,
        font: bold,
        color,
      });
    }
  }

  let y = 730;

  // 🔹 BLOQUE PRINCIPAL (tipo tabla)
  const drawRow = (label, value) => {
    page.drawText(label, { x: 60, y, size: 10, font: bold });
    page.drawText(value, { x: 200, y, size: 10, font });
    y -= 20;
  };

  drawRow("Cliente:", state.cliente);
  drawRow("Trabajo:", state.trabajo);
  drawRow("Ubicación:", state.ubicacion);

  y -= 10;

  page.drawLine({
    start: { x: 50, y },
    end: { x: 545, y },
    thickness: 1,
  });

  y -= 20;

  drawRow("Precio:", dinero(state.precio));
  drawRow("IVA:", state.iva === "si" ? "Incluido" : "No incluido");
  drawRow("Anticipo:", state.anticipo);
  drawRow("Garantía:", `${state.garantia} días`);

  // 🔹 IA SOLO PRO
  if (tipo === "pro" && usarIA) {
    const ia = await generarContenidoIA(state);

    y -= 20;

    const drawBlock = (title, text) => {
      page.drawText(title, { x: 50, y, size: 12, font: bold, color });
      y -= 15;

      const words = text.split(" ");
      let line = "";

      for (const w of words) {
        if ((line + w).length > 80) {
          page.drawText(line, { x: 50, y, size: 10, font });
          y -= 12;
          line = "";
        }
        line += w + " ";
      }

      if (line) {
        page.drawText(line, { x: 50, y, size: 10, font });
        y -= 20;
      }
    };

    drawBlock("INTRODUCCIÓN", ia.introduccion);
    drawBlock("ALCANCE", ia.alcance);
    drawBlock("RECOMENDACIONES", ia.recomendaciones);
  }

  // 🔹 LOGO PRO
  if (tipo === "pro" && branding?.logo) {
    try {
      const res = await fetch(branding.logo);
      const bytes = await res.arrayBuffer();

      const image = branding.logo.endsWith(".png")
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);

      page.drawImage(image, {
        x: 400,
        y: 720,
        width: 120,
        height: 60,
      });
    } catch {}
  }

  // 🔹 FOOTER
  if (tipo === "free") {
    page.drawText("Documento básico", { x: 50, y: 50, size: 8 });
    page.drawText(
      "Actualiza a PRO para agregar tu logo y mejorar presentación",
      { x: 50, y: 40, size: 8 },
    );
  } else {
    page.drawText("Documento profesional", { x: 50, y: 50, size: 8 });
  }

  return await pdfDoc.save();
}
