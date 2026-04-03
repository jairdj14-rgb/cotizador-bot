export function suggestItems(text) {
  const t = text.toLowerCase();

  if (t.includes("baño")) {
    return [
      { name: "Instalación lavabo", price: 1500 },
      { name: "Llave", price: 800 },
      { name: "Mano de obra", price: 1200 },
    ];
  }

  if (t.includes("electric")) {
    return [
      { name: "Cableado", price: 300 },
      { name: "Interruptor", price: 150 },
      { name: "Mano de obra", price: 500 },
    ];
  }

  if (t.includes("cámara") || t.includes("cctv")) {
    return [
      { name: "Instalación cámara", price: 1200 },
      { name: "Cableado", price: 400 },
      { name: "Configuración", price: 500 },
    ];
  }

  return null;
}
