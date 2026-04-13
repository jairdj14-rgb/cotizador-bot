import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function generatePDF(data) {
  const pdf = await PDFDocument.create();

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const brand = data.brand || {};
  const primary = brand.color ? hexToRgb(brand.color) : rgb(0.1, 0.3, 0.8);

  let page = pdf.addPage([600, 800]);
  let y = 750;

  const marginX = 50;

  // =========================
  // LOGO
  // =========================
  let logoImage = null;

  if (brand.logo && typeof brand.logo === "string") {
    try {
      const res = await fetch(brand.logo);
      if (!res.ok) throw new Error("Logo fetch failed");

      const buffer = await res.arrayBuffer();

      try {
        logoImage = await pdf.embedPng(buffer);
      } catch {
        try {
          logoImage = await pdf.embedJpg(buffer);
        } catch {
          logoImage = null;
        }
      }
    } catch {
      logoImage = null;
    }
  }

  // =========================
  // HEADER
  // =========================
  const header = () => {
    y = 750;
    const headerTop = y;

    // Logo

    if (logoImage) {
      page.drawImage(logoImage, {
        x: marginX,
        y: y - 40,
        width: 60,
        height: 60,
      });
    }

    // 🏢 NOMBRE
    page.drawText(brand.name || "Tu Empresa", {
      x: logoImage ? marginX + 70 : marginX,
      y,
      size: 16,
      font: bold,
      color: primary,
    });

    // 📞 INFO EMPRESA
    let infoY = y - 15;

    if (brand.phone) {
      page.drawText(`Tel: ${brand.phone}`, {
        x: logoImage ? marginX + 70 : marginX,
        y: infoY,
        size: 9,
        font,
      });
      infoY -= 12;
    }

    if (brand.web) {
      page.drawText(`Web: ${brand.web}`, {
        x: logoImage ? marginX + 70 : marginX,
        y: infoY,
        size: 9,
        font,
      });
      infoY -= 12;
    }

    if (brand.email) {
      page.drawText(`Email: ${brand.email}`, {
        x: logoImage ? marginX + 70 : marginX,
        y: infoY,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
      infoY -= 12;
    }

    y = infoY - 30;

    //Subtitulo

    page.drawText("Propuesta económica", {
      x: logoImage ? marginX + 70 : marginX,
      y: y - 10,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    //bloque derecho fijo
    const rightX = 420;

    // 📄 TITULO
    page.drawText(`Cotización`, {
      x: rightX,
      y: headerTop,
      size: 14,
      font: bold,
    });

    page.drawText(`ID: ${Date.now().toString().slice(-5)}`, {
      x: rightX,
      y: headerTop - 15,
      size: 9,
      font,
    });

    page.drawText(new Date().toLocaleDateString(), {
      x: rightX,
      y: headerTop - 30,
      size: 9,
      font,
    });

    y -= 35;
    // Linea
    page.drawLine({
      start: { x: marginX, y },
      end: { x: 550, y },
      thickness: 1,
      color: primary,
    });

    y -= 20;

    //Cliente box

    page.drawRectangle({
      x: marginX,
      y: y - 40,
      width: 500,
      height: 40,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 1,
    });

    page.drawText(`Cliente: ${data.cliente}`, {
      x: marginX + 10,
      y: y - 15,
      size: 10,
      font,
    });

    page.drawText(`Ubicación: ${data.ubicacion}`, {
      x: marginX + 10,
      y: y - 30,
      size: 10,
      font,
    });

    y -= 60;
  };

  // =========================
  // FOOTER
  // =========================
  const footer = () => {
    page.drawLine({
      start: { x: marginX, y: 60 },
      end: { x: 550, y: 60 },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });

    page.drawText(
      "Gracias por su confianza. Vigencia de la cotización 15 días. Precios sujetos a cambios.",
      {
        x: marginX,
        y: 40,
        size: 8,
        font,
        color: rgb(0.4, 0.4, 0.4),
      },
    );
  };

  const newPage = () => {
    footer();
    page = pdf.addPage([600, 800]);
    header();
    tableHeader();
  };

  // =========================
  // TABLA
  // =========================
  const tableHeader = () => {
    const startY = y;

    const cols = [
      { text: "Concepto", x: marginX, w: 240 }, // 👈 más ancho
      { text: "Cant.", x: 300, w: 40 },
      { text: "P. Unit", x: 350, w: 80 },
      { text: "Subtotal", x: 440, w: 80 },
    ];

    cols.forEach((c) => {
      page.drawRectangle({
        x: c.x,
        y: startY - 20,
        width: c.w,
        height: 20,
        color: rgb(0.95, 0.95, 0.95),
      });

      page.drawText(c.text, {
        x: c.x + 5,
        y: startY - 15,
        size: 10,
        font: bold,
      });
    });

    y -= 25;
  };

  const row = (item) => {
    const lines = splitText(item.name, 30);
    const rowHeight = lines.length * 12 + 6;

    if (y - rowHeight < 100) newPage();
    const cols = [
      { text: lines, x: marginX, w: 240 },
      { text: [`${item.qty}`], x: 300, w: 40 },
      { text: [formatMoney(item.price)], x: 350, w: 80 },
      { text: [formatMoney(item.total)], x: 440, w: 80 },
    ];

    cols.forEach((c) => {
      page.drawRectangle({
        x: c.x,
        y: y - rowHeight,
        width: c.w,
        height: rowHeight,
        borderWidth: 0.5,
        borderColor: rgb(0.85, 0.85, 0.85),
      });

      c.text.forEach((line, i) => {
        page.drawText(line, {
          x: c.x + 5,
          y: y - 12 - i * 12,
          size: 9,
          font,
        });
      });
    });

    y -= rowHeight + 6;
  };

  // =========================
  // START
  // =========================
  header();
  tableHeader();

  data.items.forEach(row);

  y -= 20;

  const subtotal = data.total;
  const iva = data.iva ? subtotal * 0.16 : 0;
  const total = subtotal + iva;

  if (y < 120) newPage();

  const boxX = 380;

  page.drawRectangle({
    x: boxX,
    y: y - 70,
    width: 170,
    height: 70,
    borderWidth: 1,
    borderColor: rgb(0.85, 0.85, 0.85),
  });

  //subtotal
  page.drawText("Subtotal:", { x: boxX + 10, y: y - 15, size: 10, font });
  const rightEdge = boxX + 160;
  const subtotalText = formatMoney(subtotal);
  const subtotalWidth = font.widthOfTextAtSize(subtotalText, 10);

  page.drawText(subtotalText, {
    x: rightEdge - subtotalWidth,
    y: y - 15,
    size: 10,
    font,
  });
  //IVA
  page.drawText("IVA:", { x: boxX + 10, y: y - 30, size: 10, font });
  const ivaText = formatMoney(iva);
  const ivaWidth = font.widthOfTextAtSize(ivaText, 10);

  page.drawText(ivaText, {
    x: rightEdge - ivaWidth,
    y: y - 30,
    size: 10,
    font,
  });

  //Total
  page.drawText("TOTAL:", {
    x: boxX + 10,
    y: y - 50,
    size: 11,
    font: bold,
  });

  const totalText = formatMoney(total);
  const totalWidth = bold.widthOfTextAtSize(totalText, 12);

  page.drawText(totalText, {
    x: rightEdge - totalWidth,
    y: y - 50,
    size: 12,
    font: bold,
    color: primary,
  });

  y -= 90;

  page.drawRectangle({
    x: marginX,
    y: y - 50,
    width: 250,
    height: 50,
    borderWidth: 1,
    borderColor: rgb(0.85, 0.85, 0.85),
  });

  page.drawText("Anticipo", {
    x: marginX + 10,
    y: y - 15,
    size: 9,
    font: bold,
  });

  page.drawText(`${formatMoney(data.anticipo)} (${data.anticipo_pct}%)`, {
    x: marginX + 10,
    y: y - 28,
    size: 10,
    font,
  });

  page.drawText("Garantía", {
    x: marginX + 130,
    y: y - 15,
    size: 9,
    font: bold,
  });

  page.drawText(`${data.garantia} días`, {
    x: marginX + 130,
    y: y - 28,
    size: 10,
    font,
  });

  footer();

  return await pdf.save();
}

// =========================
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);

  return rgb(
    ((bigint >> 16) & 255) / 255,
    ((bigint >> 8) & 255) / 255,
    (bigint & 255) / 255,
  );
}

function formatMoney(n) {
  return `$${Number(n).toLocaleString("es-MX")}`;
}
function splitText(text, maxLength = 25) {
  const words = String(text).split(" ");
  let lines = [];
  let current = "";

  for (const w of words) {
    if ((current + " " + w).length > maxLength) {
      lines.push(current);
      current = w;
    } else {
      current += (current ? " " : "") + w;
    }
  }

  if (current) lines.push(current);

  return lines;
}
