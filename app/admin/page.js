"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [data, setData] = useState({
    users: 0,
    free: 0,
    basic: 0,
    pro: 0,
    revenue: 0,
    conversions: 0,
    events: {
      checkout: 0,
      limit: 0,
    },
  });

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then((res) => res.json())
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <div className="p-6 grid gap-6">
      <h1 className="text-2xl font-bold">📊 SaaS Dashboard</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card title="Usuarios" value={data.users} />
        <Card title="Free" value={data.free} />
        <Card title="Basic" value={data.basic} />
        <Card title="Pro" value={data.pro} />
        <Card title="Ingresos" value={`$${data.revenue}`} />
        <Card title="Conversiones" value={`${data.conversions}%`} />
      </div>

      {/* Eventos */}
      <div className="grid grid-cols-2 gap-4">
        <Card title="Clicks Checkout" value={data.events.checkout} />
        <Card title="Límite alcanzado" value={data.events.limit} />
      </div>

      {/* Alertas */}
      <Alerts data={data} />
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="p-4 rounded-2xl shadow bg-white">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function Alerts({ data }) {
  const alerts = [];

  if (data.users > 0 && data.pro === 0) {
    alerts.push("⚠️ Tienes usuarios pero 0 conversiones");
  }

  if (data.events.checkout > 0 && data.pro === 0) {
    alerts.push("🚨 Usuarios hacen click pero no pagan");
  }

  if (data.events.limit > 5) {
    alerts.push(
      "🔥 Muchos usuarios llegan al límite → buen momento para subir precio",
    );
  }

  if (!alerts.length) {
    return <div className="text-green-600">✅ Todo bien</div>;
  }

  return (
    <div className="p-4 bg-yellow-50 rounded-xl">
      <div className="font-semibold mb-2">Alertas</div>
      {alerts.map((a, i) => (
        <div key={i}>• {a}</div>
      ))}
    </div>
  );
}
