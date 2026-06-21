"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useOpenCalls } from "@/components/dashboard/OpenCallsProvider";
import { db, RESTAURANT_ID } from "@/lib/firebase";
import { logFirestoreRead } from "@/lib/firestore-debug";
import {
  getCallTableLabel,
  normalizeWaiterCall,
  normalizeTable,
} from "@/lib/firestore-models";
import {
  getRestaurantRecentCompletedCallsQuery,
  getRestaurantTablesQuery,
} from "@/lib/firestore-queries";
import { useRestaurantSettingsContext } from '@/components/RestaurantSettingsProvider'
import { resolveRestaurantBusinessName } from '@/lib/restaurant-settings'
import type { WaiterCall, Table } from "@/lib/types";

const BROWN = "#3d2b1f";
const GOLD = "#d4a017";

const TIP_CFG: Record<string, { label: string; icon: string; color: string }> =
  {
    sipariş: { label: "Sipariş", icon: "📋", color: "#f97316" },
    hesap: { label: "Hesap", icon: "💳", color: "#10b981" },
    yardım: { label: "Yardım", icon: "🙋", color: "#3b82f6" },
  };

function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function elapsed(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  return m < 1 ? "az önce" : `${m} dk önce`;
}

function buildHourlyData(calls: WaiterCall[]) {
  const now = new Date();
  return Array.from({ length: 8 }, (_, i) => {
    const h = new Date(now);
    h.setHours(h.getHours() - (7 - i), 0, 0, 0);
    const start = h.getTime();
    const end = start + 3_600_000;
    return {
      hour: `${String(h.getHours()).padStart(2, "0")}:00`,
      count: calls.filter((c) => c.createdAt >= start && c.createdAt < end)
        .length,
    };
  });
}

export default function DashboardPage() {
  const { pendingCalls } = useOpenCalls();
  const { settings } = useRestaurantSettingsContext()
  const router = useRouter();
  const [completedCalls, setCompletedCalls] = useState<WaiterCall[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeWaiters, setActiveWaiters] = useState(0);
  const [, setTick] = useState(0);

  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");
  const businessName = resolveRestaurantBusinessName(settings)

  useEffect(() => {
    let cancelled = false;

    async function loadCompletedCalls() {
      const snap = await getDocs(
        getRestaurantRecentCompletedCallsQuery(RESTAURANT_ID),
      );
      if (cancelled) return;
      setCompletedCalls(
        snap.docs.map((doc) =>
          normalizeWaiterCall(doc.id, doc.data() as Record<string, unknown>),
        ),
      );
    }

    void loadCompletedCalls();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTables() {
      logFirestoreRead("dashboard/tables", RESTAURANT_ID);
      const snap = await getDocs(getRestaurantTablesQuery(RESTAURANT_ID));
      if (cancelled) return;
      setTables(
        snap.docs.map((d) =>
          normalizeTable(d.id, d.data() as Record<string, unknown>),
        ),
      );
    }

    void loadTables();

    return () => {
      cancelled = true;
    };
  }, []);

  // Active waiters count
  useEffect(() => {
    let cancelled = false;

    async function loadActiveWaiters() {
      logFirestoreRead("dashboard/online waiters", RESTAURANT_ID);
      const snap = await getDocs(
        query(
          collection(db, "users"),
          where("restaurantId", "==", RESTAURANT_ID),
          where("role", "==", "waiter"),
          where("isOnline", "==", true),
          limit(50),
        ),
      );
      if (cancelled) return;
      setActiveWaiters(snap.size);
    }

    void loadActiveWaiters();

    return () => {
      cancelled = true;
    };
  }, []);

  // 1-minute tick for elapsed times
  useEffect(() => {
    if (pendingCalls.length === 0) return;

    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [pendingCalls.length]);

  // ─── Derived data ─────────────────────────────────────────────────────────
  const todayStart = getTodayStart();
  const sortedPendingCalls = [...pendingCalls].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  const todayCompleted = completedCalls.filter(
    (c) => c.createdAt >= todayStart,
  );
  const activeTables = tables.filter((t) =>
    ["aktif", "çağrı var", "hesap istendi"].includes(t.status),
  ).length;

  // Top waiter
  const waiterMap = new Map<string, { name: string; count: number }>();
  todayCompleted.forEach((c) => {
    if (!c.waiterId || !c.waiterName) return;
    const prev = waiterMap.get(c.waiterId) ?? { name: c.waiterName, count: 0 };
    waiterMap.set(c.waiterId, { name: c.waiterName, count: prev.count + 1 });
  });
  const topWaiter =
    [...waiterMap.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  // Avg response time (createdAt → acceptedAt)
  const rTimes = completedCalls
    .filter((c) => c.acceptedAt && c.createdAt)
    .map((c) => (c.acceptedAt! - c.createdAt) / 1000);
  const avgResponse =
    rTimes.length > 0
      ? rTimes.reduce((a, b) => a + b, 0) / rTimes.length
      : null;
  const fmtAvg =
    avgResponse === null
      ? "—"
      : avgResponse < 60
        ? `${Math.round(avgResponse)}s`
        : `${Math.round(avgResponse / 60)}dk`;

  const occupancy =
    tables.length > 0 ? Math.round((activeTables / tables.length) * 100) : 0;
  const hourlyData = buildHourlyData(completedCalls);
  const top5Pending = sortedPendingCalls.slice(0, 5);

  async function handleSeed() {
    setSeeding(true);
    setSeedMsg("");
    try {
      const { seedmrssimoneChocolate } = await import("@/lib/seed");
      await seedmrssimoneChocolate();
      setSeedMsg("✓ Demo verisi yüklendi!");
    } catch (err) {
      setSeedMsg(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="font-bold text-2xl" style={{ color: BROWN }}>
          Genel Bakış
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          {businessName} — Canlı veriler
        </p>
      </div>

      {/* ── Üst istatistikler ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon="🔔"
          label="Bekleyen Çağrı"
          value={pendingCalls.length}
          urgent={pendingCalls.length > 0}
          onClick={() => router.push("/dashboard/calls")}
        />
        <StatCard icon="🪑" label="Aktif Masa" value={activeTables} />
        <StatCard
          icon="✅"
          label="Bugün Tamamlanan"
          value={todayCompleted.length}
        />
        <StatCard icon="👨‍🍳" label="Aktif Garson" value={activeWaiters} />
      </div>

      {/* ── Orta bölüm ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        {/* Canlı çağrılar */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg" style={{ color: BROWN }}>
              Bekleyen Çağrılar
            </h2>
            <button
              onClick={() => router.push("/dashboard/calls")}
              className="text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{
                background: "#faf7f4",
                color: BROWN,
                border: "1px solid #e9e2da",
              }}
            >
              Tümünü Gör →
            </button>
          </div>

          {top5Pending.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-gray-400 text-sm">Bekleyen çağrı yok</p>
            </div>
          ) : (
            <div className="space-y-2">
              {top5Pending.map((call) => {
                const cfg = TIP_CFG[call.tip] ?? TIP_CFG.yardım;
                return (
                  <div
                    key={call.id}
                    className="bg-white rounded-2xl border border-gray-100 px-5 py-3.5 flex items-center justify-between gap-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{cfg.icon}</span>
                      <div>
                        <p
                          className="font-semibold text-sm"
                          style={{ color: BROWN }}
                        >
                          Masa {getCallTableLabel(call)}
                        </p>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: cfg.color }}
                        >
                          {cfg.label}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {elapsed(call.createdAt)}
                    </span>
                  </div>
                );
              })}
              {pendingCalls.length > 5 && (
                <p className="text-xs text-center text-gray-400 pt-1">
                  +{pendingCalls.length - 5} çağrı daha
                </p>
              )}
            </div>
          )}
        </section>

        {/* Günün özeti */}
        <section>
          <h2 className="font-semibold text-lg mb-3" style={{ color: BROWN }}>
            Günün Özeti
          </h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <SummaryCard
              label="En Aktif Garson"
              value={topWaiter ? topWaiter.name.split(" ")[0] : "—"}
              sub={topWaiter ? `${topWaiter.count} çağrı` : undefined}
            />
            <SummaryCard label="Ort. Yanıt" value={fmtAvg} sub="ilk kabul" />
            <SummaryCard
              label="Doluluk"
              value={tables.length > 0 ? `%${occupancy}` : "—"}
              sub={`${activeTables}/${tables.length} masa`}
            />
          </div>

          {/* Saatlik grafik */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-sm font-semibold mb-4" style={{ color: BROWN }}>
              Son 8 Saat — Çağrı Dağılımı
            </p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart
                data={hourlyData}
                margin={{ top: 0, right: 4, bottom: 0, left: -20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f0ede9"
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "10px",
                    border: "1px solid #f0ede9",
                    fontSize: "12px",
                  }}
                  formatter={(value) => [value, "Çağrı"]}
                  cursor={{ fill: "rgba(212,160,23,0.08)" }}
                />
                <Bar
                  dataKey="count"
                  fill={GOLD}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* ── Demo veri — sadece geliştirme ortamında ── */}
      {process.env.NODE_ENV === "development" && (
        <details className="bg-white rounded-xl border border-gray-100 p-5 max-w-md">
          <summary
            className="cursor-pointer font-semibold text-sm select-none"
            style={{ color: BROWN }}
          >
            🍫 Demo Veri Yükle
          </summary>
          <p className="text-gray-400 text-xs mt-3 mb-3">
            5 kategori, 24 ürün ve demo çağrılar yükler. Yalnızca boş
            veritabanında çalışır.
          </p>
          {seedMsg && (
            <p
              className="text-sm mb-3"
              style={{ color: seedMsg.startsWith("✓") ? "#16a34a" : "#ef4444" }}
            >
              {seedMsg}
            </p>
          )}
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="font-semibold px-4 py-2 rounded-lg disabled:opacity-50 text-sm"
            style={{ background: GOLD, color: BROWN }}
          >
            {seeding ? "Yükleniyor..." : "Yükle"}
          </button>
        </details>
      )}
    </div>
  );
}

// ─── Alt bileşenler ──────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  urgent,
  onClick,
}: {
  icon: string;
  label: string;
  value: number;
  urgent?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`bg-white rounded-2xl p-5 border-2 transition-shadow${onClick ? " cursor-pointer hover:shadow-md" : ""}`}
      style={{
        borderColor: urgent ? GOLD : "#f0ede9",
        boxShadow: urgent ? "0 2px 12px rgba(212,160,23,0.12)" : undefined,
      }}
      onClick={onClick}
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="flex items-center gap-2">
        <span
          className="text-3xl font-bold"
          style={{ color: urgent ? GOLD : BROWN }}
        >
          {value}
        </span>
        {urgent && value > 0 && (
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </div>
      <div className="text-gray-400 text-sm mt-1">{label}</div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="font-bold text-lg leading-tight" style={{ color: BROWN }}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
