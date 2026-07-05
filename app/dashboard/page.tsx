"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  type LucideIcon,
  Armchair,
  Bell,
  CircleCheckBig,
  Calendar,
  Calculator,
  ChevronDown,
  MessageCircle,
  Package,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useOpenCalls } from "@/components/dashboard/OpenCallsProvider";
import { getCallTipUi } from "@/lib/call-tip-ui";
import { db } from "@/lib/firebase";
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
import {
  calculateAnalytics,
  formatCurrency,
  formatNumber,
  getDateRangeConfig,
  buildHourlyOrderData,
  DATE_RANGE_LABELS,
  type DateRange,
  type AnalyticsData,
  type HourlyDataPoint,
} from '@/lib/analytics'
import type { Restaurant, Table, WaiterCall } from "@/lib/types";

const TEXT = "var(--text)";
const PRIMARY = "var(--primary)";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getTodayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function elapsed(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  return m < 1 ? "az önce" : `${m} dk önce`;
}


const EMPTY_ANALYTICS: AnalyticsData = {
  totalRevenue: 0,
  orderCount: 0,
  itemsSold: 0,
  averageCartValue: 0,
  completedOrders: 0,
  pendingOrders: 0,
  topProducts: [],
  topTables: [],
  categoryBreakdown: [],
}

function getTrialBannerState(restaurant: Restaurant | null) {
  if (!restaurant || restaurant.plan !== 'trial' || typeof restaurant.trialEndsAt !== 'number') {
    return null
  }

  const diff = restaurant.trialEndsAt - Date.now()
  if (diff <= 0) {
    return { state: 'expired' as const }
  }

  return {
    state: 'active' as const,
    daysRemaining: Math.max(1, Math.ceil(diff / DAY_IN_MS)),
  }
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const { pendingCalls } = useOpenCalls();
  const { settings, restaurant } = useRestaurantSettingsContext()
  const router = useRouter();
  const restaurantId = profile?.restaurantId || '';
  const [completedCalls, setCompletedCalls] = useState<WaiterCall[]>([]);
  const [allOrderCalls, setAllOrderCalls] = useState<WaiterCall[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeWaiters, setActiveWaiters] = useState(0);
  const [, setTick] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const businessName = resolveRestaurantBusinessName(settings)
  const trialBanner = getTrialBannerState(restaurant)

  // Calculate analytics using useMemo instead of useEffect
  const analytics = useMemo(() => {
    if (allOrderCalls.length === 0) return EMPTY_ANALYTICS
    const customStart = customStartDate ? new Date(customStartDate) : undefined
    const customEnd = customEndDate ? new Date(customEndDate + 'T23:59:59') : undefined
    const config = getDateRangeConfig(dateRange, customStart, customEnd)
    return calculateAnalytics(allOrderCalls, config)
  }, [allOrderCalls, dateRange, customStartDate, customEndDate])

  // Calculate hourly order distribution
  const hourlyOrderData = useMemo((): HourlyDataPoint[] => {
    if (allOrderCalls.length === 0) return []
    const customStart = customStartDate ? new Date(customStartDate) : undefined
    const customEnd = customEndDate ? new Date(customEndDate + 'T23:59:59') : undefined
    const config = getDateRangeConfig(dateRange, customStart, customEnd)
    return buildHourlyOrderData(allOrderCalls, config)
  }, [allOrderCalls, dateRange, customStartDate, customEndDate])

  // Load completed calls for call distribution chart
  useEffect(() => {
    let cancelled = false;

    async function loadCompletedCalls() {
      if (!restaurantId) return;
      const snap = await getDocs(
        getRestaurantRecentCompletedCallsQuery(restaurantId),
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
  }, [restaurantId]);

  // Load all order calls for analytics (last 90 days)
  useEffect(() => {
    let cancelled = false;

    async function loadOrderCalls() {
      if (!restaurantId) return;
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
      logFirestoreRead("dashboard/order calls", restaurantId);

      const orderCallsQuery = query(
        collection(db, 'restaurants', restaurantId, 'calls'),
        where('tip', '==', 'sipariş'),
        orderBy('createdAt', 'desc'),
        limit(500)
      );

      const snap = await getDocs(orderCallsQuery);
      if (cancelled) return;

      const calls = snap.docs
        .map((doc) => normalizeWaiterCall(doc.id, doc.data() as Record<string, unknown>))
        .filter((c) => c.createdAt >= ninetyDaysAgo);

      setAllOrderCalls(calls);
    }

    void loadOrderCalls();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTables() {
      if (!restaurantId) return;
      logFirestoreRead("dashboard/tables", restaurantId);
      const snap = await getDocs(getRestaurantTablesQuery(restaurantId));
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
  }, [restaurantId]);

  // Active waiters count
  useEffect(() => {
    let cancelled = false;

    async function loadActiveWaiters() {
      if (!restaurantId) return;
      logFirestoreRead("dashboard/online waiters", restaurantId);
      const snap = await getDocs(
        query(
          collection(db, "users"),
          where("restaurantId", "==", restaurantId),
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
  }, [restaurantId]);

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
  const top5Pending = sortedPendingCalls.slice(0, 5);

  const completionRate = analytics.orderCount > 0
    ? Math.round((analytics.completedOrders / analytics.orderCount) * 100)
    : 0;

  return (
    <div className="mobile-overflow-fix overflow-x-hidden p-4 sm:p-6 md:p-8">
      {trialBanner && (
        <div
          className="mb-6 rounded-[1.75rem] border px-5 py-4"
          style={{
            background: trialBanner.state === 'active' ? 'var(--primary-soft)' : 'rgba(245, 158, 11, 0.12)',
            borderColor: trialBanner.state === 'active' ? 'var(--primary-border)' : 'rgba(245, 158, 11, 0.22)',
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: TEXT }}>
                {trialBanner.state === 'active'
                  ? `7 günlük ücretsiz deneme süreniz aktif. Kalan süre: ${trialBanner.daysRemaining} gün.`
                  : 'Deneme süreniz bitti. Devam etmek için WhatsApp üzerinden iletişime geçin.'}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {trialBanner.state === 'active'
                  ? 'Deneme süresi boyunca panelinizi ve QR menü altyapınızı kullanmaya devam edebilirsiniz.'
                  : 'Aboneliği devam ettirmek için hızlıca bizimle bağlantı kurabilirsiniz.'}
              </p>
            </div>

            {trialBanner.state === 'expired' ? (
              <a
                href="https://wa.me/905421320706"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-92"
                style={{ background: '#25d366' }}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp ile İletişime Geç
              </a>
            ) : (
              <span
                className="inline-flex items-center justify-center rounded-full px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ background: '#ffffff', color: PRIMARY }}
              >
                Deneme Aktif
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-bold text-2xl" style={{ color: TEXT }}>
            Genel Bakış
          </h1>
          <p className="mt-0.5 break-words text-sm text-gray-400">
            {businessName} — Canlı veriler
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="relative w-full sm:w-auto">
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium transition-all hover:shadow-md sm:w-auto sm:justify-start"
            style={{ borderColor: 'var(--border-soft)', color: TEXT }}
          >
            <Calendar size={16} />
            {dateRange === 'custom' && customStartDate && customEndDate
              ? `${customStartDate} - ${customEndDate}`
              : DATE_RANGE_LABELS[dateRange]}
            <ChevronDown size={16} className={`transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
          </button>

          {showDatePicker && (
            <div
              className="absolute right-0 top-full z-10 mt-2 min-w-[200px] rounded-xl border bg-white py-2 shadow-xl"
              style={{ borderColor: 'var(--border-soft)' }}
            >
              {(['today', 'week', 'month', 'year'] as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => { setDateRange(range); setShowDatePicker(false); }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${dateRange === range && dateRange !== 'custom' ? 'font-semibold' : ''}`}
                  style={{ color: dateRange === range && dateRange !== 'custom' ? PRIMARY : TEXT }}
                >
                  {DATE_RANGE_LABELS[range]}
                </button>
              ))}
              <div className="border-t my-2" style={{ borderColor: 'var(--border-soft)' }} />
              <div className="px-4 py-2">
                <p className="text-xs font-medium mb-2" style={{ color: TEXT }}>Özel Tarih Aralığı</p>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full rounded-lg border px-3 py-1.5 text-sm"
                    style={{ borderColor: 'var(--border-soft)', color: TEXT }}
                  />
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full rounded-lg border px-3 py-1.5 text-sm"
                    style={{ borderColor: 'var(--border-soft)', color: TEXT }}
                  />
                  <button
                    onClick={() => {
                      if (customStartDate && customEndDate) {
                        setDateRange('custom');
                        setShowDatePicker(false);
                      }
                    }}
                    disabled={!customStartDate || !customEndDate}
                    className="w-full rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: PRIMARY }}
                  >
                    Uygula
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Satış İstatistikleri ─────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4">
        <RevenueCard
          Icon={TrendingUp}
          label={`${DATE_RANGE_LABELS[dateRange]} Ciro`}
          value={formatCurrency(analytics.totalRevenue)}
          highlight
        />
        <RevenueCard
          Icon={ShoppingBag}
          label="Sipariş Sayısı"
          value={formatNumber(analytics.orderCount)}
        />
        <RevenueCard
          Icon={Package}
          label="Satılan Ürün"
          value={formatNumber(analytics.itemsSold)}
        />
        <RevenueCard
          Icon={Calculator}
          label="Ort. Sepet"
          value={formatCurrency(analytics.averageCartValue)}
        />
      </div>

      {/* ── Operasyonel İstatistikler ─────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4">
        <StatCard
          Icon={Bell}
          label="Bekleyen Çağrı"
          value={pendingCalls.length}
          urgent={pendingCalls.length > 0}
          onClick={() => router.push("/dashboard/calls")}
        />
        <StatCard Icon={Armchair} label="Aktif Masa" value={activeTables} />
        <StatCard
          Icon={CircleCheckBig}
          label="Bugün Tamamlanan"
          value={todayCompleted.length}
        />
        <StatCard Icon={Users} label="Aktif Garson" value={activeWaiters} />
      </div>

      {/* ── Orta bölüm ───────────────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Canlı çağrılar */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg" style={{ color: TEXT }}>
              Bekleyen Çağrılar
            </h2>
            <button
              onClick={() => router.push("/dashboard/calls")}
              className="text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{
                background: "var(--surface-muted)",
                color: TEXT,
                border: "1px solid var(--border-soft)",
              }}
            >
              Tümünü Gör →
            </button>
          </div>

          {top5Pending.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <CircleCheckBig className="mx-auto mb-2 h-8 w-8 text-[var(--primary)]" />
              <p className="text-gray-400 text-sm">Bekleyen çağrı yok</p>
            </div>
          ) : (
            <div className="space-y-2">
              {top5Pending.map((call) => {
                const tipUi = getCallTipUi(call.tip);
                const TipIcon = tipUi.Icon;
                return (
                  <div
                    key={call.id}
                    className="bg-white rounded-2xl border border-gray-100 px-5 py-3.5 flex items-center justify-between gap-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-2xl"
                        style={{ background: tipUi.surface, color: tipUi.accent }}
                      >
                        <TipIcon className="h-5 w-5" />
                      </span>
                      <div>
                        <p
                          className="font-semibold text-sm"
                          style={{ color: TEXT }}
                        >
                          Masa {getCallTableLabel(call)}
                        </p>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: tipUi.accent }}
                        >
                          {tipUi.label}
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
          <h2 className="font-semibold text-lg mb-3" style={{ color: TEXT }}>
            Günün Özeti
          </h2>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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

          {/* Saatlik sipariş grafiği */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-sm font-semibold mb-4" style={{ color: TEXT }}>
              Saatlik Sipariş Dağılımı
            </p>
            {hourlyOrderData.length === 0 ? (
              <div className="flex items-center justify-center h-[140px] text-sm text-gray-400">
                Seçilen aralıkta sipariş yok
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={hourlyOrderData}
                  margin={{ top: 0, right: 4, bottom: 0, left: -20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border-soft)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    interval={1}
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
                      border: "1px solid var(--border-soft)",
                      fontSize: "12px",
                    }}
                    formatter={(value, name) => {
                      const num = typeof value === 'number' ? value : 0;
                      if (name === 'count') return [num, 'Sipariş'];
                      if (name === 'revenue') return [formatCurrency(num), 'Ciro'];
                      return [num, String(name)];
                    }}
                    cursor={{ fill: "var(--primary-soft)" }}
                  />
                  <Bar
                    dataKey="count"
                    fill={PRIMARY}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* ── Satış Detayları ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* En çok satan ürünler */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-base mb-4" style={{ color: TEXT }}>
            En Çok Satan Ürünler
          </h3>
          {analytics.topProducts.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Henüz veri yok</p>
          ) : (
            <div className="space-y-3">
              {analytics.topProducts.map((product, index) => (
                <div key={product.name} className="flex items-center gap-3">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      background: index === 0 ? PRIMARY : 'var(--surface-muted)',
                      color: index === 0 ? '#fff' : TEXT,
                    }}
                  >
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: TEXT }}>
                      {product.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {product.quantity} adet • {formatCurrency(product.revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* En aktif masalar */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-base mb-4" style={{ color: TEXT }}>
            En Aktif Masalar
          </h3>
          {analytics.topTables.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Henüz veri yok</p>
          ) : (
            <div className="space-y-3">
              {analytics.topTables.map((table, index) => (
                <div key={table.tableNumber} className="flex items-center gap-3">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      background: index === 0 ? PRIMARY : 'var(--surface-muted)',
                      color: index === 0 ? '#fff' : TEXT,
                    }}
                  >
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: TEXT }}>
                      Masa {table.tableNumber}
                    </p>
                    <p className="text-xs text-gray-400">
                      {table.orderCount} sipariş • {formatCurrency(table.revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sipariş durumu & kategori dağılımı */}
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-base mb-4" style={{ color: TEXT }}>
            Sipariş Durumu
          </h3>

          {analytics.orderCount === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Henüz veri yok</p>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1">
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${completionRate}%`, background: PRIMARY }}
                    />
                  </div>
                </div>
                <span className="text-sm font-bold shrink-0" style={{ color: PRIMARY }}>
                  %{completionRate}
                </span>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl p-3" style={{ background: 'var(--surface-muted)' }}>
                  <p className="text-xs text-gray-400">Tamamlanan</p>
                  <p className="text-lg font-bold" style={{ color: PRIMARY }}>
                    {analytics.completedOrders}
                  </p>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'var(--surface-muted)' }}>
                  <p className="text-xs text-gray-400">Bekleyen</p>
                  <p className="text-lg font-bold" style={{ color: TEXT }}>
                    {analytics.pendingOrders}
                  </p>
                </div>
              </div>

              {analytics.categoryBreakdown.length > 0 && (
                <>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4">
                    Kategori Dağılımı
                  </h4>
                  <div className="space-y-2">
                    {analytics.categoryBreakdown.slice(0, 4).map((cat) => (
                      <div key={cat.category} className="flex items-center justify-between text-sm">
                        <span className="truncate" style={{ color: TEXT }}>{cat.category}</span>
                        <span className="text-gray-400 shrink-0 ml-2">{cat.quantity} adet</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Alt bileşenler ──────────────────────────────────────────────────────────

function StatCard({
  Icon,
  label,
  value,
  urgent,
  onClick,
}: {
  Icon: LucideIcon;
  label: string;
  value: number;
  urgent?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`bg-white rounded-2xl p-3 sm:p-5 border-2 transition-shadow${onClick ? " cursor-pointer hover:shadow-md" : ""}`}
      style={{
        borderColor: urgent ? PRIMARY : "var(--border-soft)",
        boxShadow: urgent ? "0 18px 32px var(--primary-soft)" : undefined,
      }}
      onClick={onClick}
    >
      <div className="mb-1.5 sm:mb-2">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: urgent ? PRIMARY : TEXT }} />
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span
          className="text-2xl sm:text-3xl font-bold"
          style={{ color: urgent ? PRIMARY : TEXT }}
        >
          {value}
        </span>
        {urgent && value > 0 && (
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </div>
      <div className="text-gray-400 text-xs sm:text-sm mt-1 truncate">{label}</div>
    </div>
  );
}

function RevenueCard({
  Icon,
  label,
  value,
  highlight,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="bg-white rounded-2xl p-3 sm:p-5 border transition-shadow hover:shadow-md"
      style={{
        borderColor: highlight ? PRIMARY : "var(--border-soft)",
        background: highlight ? 'linear-gradient(135deg, var(--primary-soft) 0%, #fff 100%)' : '#fff',
      }}
    >
      <div className="mb-1.5 sm:mb-2">
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: highlight ? PRIMARY : 'var(--muted)' }} />
      </div>
      <div className="text-lg sm:text-2xl font-bold truncate" style={{ color: highlight ? PRIMARY : TEXT }}>
        {value}
      </div>
      <div className="text-gray-400 text-[10px] sm:text-xs mt-1 truncate">{label}</div>
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
      <p className="font-bold text-lg leading-tight" style={{ color: TEXT }}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
