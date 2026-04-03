import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// =========================
// HEX → RGB
// =========================
function hexToRgb(hex) {
  if (!hex) return rgb(0, 0, 0);
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);

  return rgb(
    ((bigint >> 16) & 255) / 255,
    ((bigint >> 8) & 255) / 255,
    (bigint & 255) / 255,
  );
}

// =========================
// WRAP TEXTO
// =========================
function wrap(text = "", max = 80) {
  const words = text.split(" ");
  let lines = [];
  let line = "";

  for (let w of words) {
    if ((line + w).length > max) {
      lines.push(line);
      line = w + " ";
    } else {
      line += w + " ";
    }
  }

  if (line) lines.push(line);
  return lines;
}

// =========================
// MAIN
// =========================
export async function generatePDF(data, branding = {}) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([600, 800]); // Cambié de const a let

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primary = hexToRgb(branding?.color || "#1a237e");

  let y = 760;

  // =========================
  // HEADER
  // =========================
  page.drawText(branding?.name || "Tu Empresa", {
    x: 50,
    y,
    size: 16,
    font: bold,
    color: primary,
  });

  page.drawText("COTIZACIÓN", {
    x: 50,
    y: y - 20,
    size: 12,
    font: bold,
  });

  page.drawText(`ID: ${data.id}`, {
    x: 450,
    y,
    size: 10,
    font,
  });

  // LOGO
  if (branding?.logo) {
    try {
      const res = await fetch(branding.logo);
      const bytes = await res.arrayBuffer();

      let img;
      if (branding.logo.includes(".png")) {
        img = await pdfDoc.embedPng(bytes);
      } else {
        img = await pdfDoc.embedJpg(bytes);
      }

      page.drawImage(img, {
        x: 450,
        y: 720,
        width: 100,
        height: 40,
      });
    } catch {}
  }

  y -= 80;

  // =========================
  // BLOQUE CLIENTE
  // =========================
  page.drawRectangle({
    x: 50,
    y: y - 90,
    width: 500,
    height: 90,
    borderWidth: 1,
    borderColor: primary,
  });

  page.drawText("Cliente", {
    x: 60,
    y: y - 20,
    size: 10,
    font: bold,
    color: primary,
  });

  page.drawText(data.cliente || "-", {
    x: 60,
    y: y - 35,
    size: 11,
    font,
  });

  page.drawText("Fecha", {
    x: 300,
    y: y - 20,
    size: 10,
    font: bold,
    color: primary,
  });

  page.drawText(new Date().toLocaleDateString(), {
    x: 300,
    y: y - 35,
    size: 10,
    font,
  });

  y -= 120;

  // =========================
  // ITEMS (CARRITO)
  // =========================
  const items = data.items || [];
  let total = 0;

  page.drawText("Conceptos", {
    x: 50,
    y,
    size: 12,
    font: bold,
  });

  y -= 20;

  items.forEach((i) => {
    total += i.total;

    page.drawText(`${i.name} x${i.qty}`, {
      x: 50,
      y,
      size: 10,
      font,
    });

    page.drawText(`$${i.total}`, {
      x: 450,
      y,
      size: 10,
      font,
    });

    y -= 15;

    // Si y se sale de la página, se agrega una nueva página
    if (y < 50) {
      page = pdfDoc.addPage([600, 800]); // Cambié de const a let
      y = 760; // Reset page height
    }
  });

  y -= 20;

  // =========================
  // LINEA
  // =========================
  page.drawLine({
    start: { x: 50, y },
    end: { x: 550, y },
    thickness: 1,
    color: primary,
  });

  y -= 25;

  // =========================
  // RESUMEN
  // =========================
  const iva = data.iva ? Math.round(total * 0.16) : 0;
  const totalFinal = total + iva;

  page.drawText("Subtotal", { x: 50, y, size: 10, font });
  page.drawText(`$${total}`, { x: 450, y, size: 10, font });

  y -= 15;

  page.drawText("IVA", { x: 50, y, size: 10, font });
  page.drawText(`$${iva}`, { x: 450, y, size: 10, font });

  y -= 15;

  page.drawText("TOTAL", {
    x: 50,
    y,
    size: 10,
    font: bold,
  });

  page.drawText(`$${totalFinal}`, {
    x: 450,
    y,
    size: 10,
    font: bold,
  });

  y -= 30;

  // =========================
  // FOOTER
  // =========================
  page.drawLine({
    start: { x: 50, y },
    end: { x: 550, y },
    thickness: 1,
    color: primary,
  });

  y -= 20;

  page.drawText(`Anticipo: $${data.anticipo || 0} (${data.porcentaje || 0}%)`, {
    x: 50,
    y,
    size: 10,
    font,
  });

  y -= 15;

  page.drawText("Garantía: 30 días", {
    x: 50,
    y,
    size: 10,
    font,
  });

  y -= 15;

  page.drawText("Los precios pueden ajustarse según condiciones del mercado.", {
    x: 50,
    y,
    size: 9,
    font,
  });

  y -= 15;

  page.drawText(
    "No nos hacemos responsables por mal uso o factores externos.",
    { x: 50, y, size: 9, font },
  );

  y -= 20;

  page.drawText("Gracias por su confianza", {
    x: 50,
    y,
    size: 10,
    font: bold,
  });

  return await pdfDoc.save();
}
