"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDocs } from "firebase/firestore";
import { ref as dbRef, onValue } from "firebase/database";
import { ArrowLeft } from "lucide-react";
import { logFirestoreRead } from "@/lib/firestore-debug";
import { getRestaurantActiveWaitersQuery } from "@/lib/firestore-queries";
import { auth, rtdb } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { useRestaurantSettings } from "@/hooks/useRestaurantSettings";
import { resolveRestaurantBusinessName } from "@/lib/restaurant-settings";
import { buildThemePalette, buildThemeStyleVars } from "@/lib/ui-theme";
import type { UserProfile } from "@/lib/types";

type PresenceData = {
  online: boolean;
  name: string;
  lastSeen: number;
};

function tsToMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof (ts as { toMillis?: unknown }).toMillis === "function") {
    return (ts as { toMillis(): number }).toMillis();
  }
  if (typeof (ts as { toDate?: unknown }).toDate === "function") {
    return (ts as { toDate(): Date }).toDate().getTime();
  }
  return 0;
}

function formatLastSeen(ts: unknown): string {
  const ms = tsToMs(ts);
  if (!ms) return "bilinmiyor";
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export default function LeaderboardPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const restaurantId = profile?.restaurantId || "";
  const { settings } = useRestaurantSettings(restaurantId);
  const [waiters, setWaiters] = useState<UserProfile[]>([]);
  const [presence, setPresence] = useState<Record<string, PresenceData>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  const businessName = resolveRestaurantBusinessName(settings);
  const themePalette = buildThemePalette(settings.primaryColor);
  const themeVars = buildThemeStyleVars(themePalette.primary);
  const primary = themePalette.primary;
  const primaryForeground = themePalette.primaryForeground;
  const text = themePalette.text;
  const muted = themePalette.muted;
  const borderSoft = themePalette.borderSoft;
  const surfaceMuted = themePalette.surfaceMuted;

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace("/waiter/login");
      return;
    }
    if (profile.role !== "waiter") {
      router.replace(
        profile.role === "super_admin"
          ? "/super-admin"
          : profile.role === "admin"
            ? "/dashboard"
            : "/waiter/login",
      );
    }
  }, [loading, profile, router, user]);

  useEffect(() => {
    if (loading) return;
    if (!user || !profile || profile.role !== "waiter" || !restaurantId) return;

    let cancelled = false;

    async function loadWaiters() {
      setDataLoading(true);
      setDataError("");
      try {
        logFirestoreRead("waiter/leaderboard", restaurantId);
        const snap = await getDocs(getRestaurantActiveWaitersQuery(restaurantId));
        if (cancelled) return;
        const list = snap.docs.map(
          (docSnap) => ({ uid: docSnap.id, ...docSnap.data() }) as UserProfile,
        );
        list.sort((a, b) => {
          const callDiff = (b.totalCalls ?? 0) - (a.totalCalls ?? 0);
          if (callDiff !== 0) return callDiff;
          return (b.avgRating ?? 0) - (a.avgRating ?? 0);
        });
        setWaiters(list);
      } catch (error) {
        if (cancelled) return;
        console.error("Leaderboard yükleme hatası:", error);
        setWaiters([]);
        setDataError("Sıralama verileri yüklenemedi. Lütfen tekrar deneyin.");
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    void loadWaiters();

    return () => {
      cancelled = true;
    };
  }, [loading, profile, restaurantId, user]);

  useEffect(() => {
    if (!user || !profile || profile.role !== "waiter" || !restaurantId || !rtdb) return;

    const presenceRef = dbRef(rtdb, `presence/${restaurantId}/waiters`);
    const unsubscribe = onValue(
      presenceRef,
      (snap) => {
        const data = snap.val() as Record<string, PresenceData> | null;
        setPresence(data ?? {});
      },
      (error) => {
        if (process.env.NODE_ENV !== "production") {
          console.error("RTDB PRESENCE READ ERROR", {
            path: `presence/${restaurantId}/waiters`,
            uid: auth.currentUser?.uid,
            error,
          });
        }
      },
    );

    return () => unsubscribe();
  }, [profile, restaurantId, user]);

  if (loading || !profile || profile.role !== "waiter") {
    return (
      <div className="theme-page flex min-h-screen items-center justify-center" style={themeVars}>
        <p className="animate-pulse text-sm text-[var(--muted)]">Yükleniyor...</p>
      </div>
    );
  }

  if (!restaurantId) {
    return (
      <div className="theme-page flex min-h-screen items-center justify-center px-6" style={themeVars}>
        <div className="theme-card max-w-sm rounded-[1.75rem] px-6 py-8 text-center">
          <p className="text-lg font-semibold text-[var(--text)]">İşletme hesabı bulunamadı.</p>
          <p className="mt-2 text-sm text-gray-500">Garson profilinde `restaurantId` alanı eksik.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-page min-h-screen pb-8" style={themeVars}>
      <header
        className="sticky top-0 z-20"
        style={{ background: `linear-gradient(135deg, ${primary} 0%, ${primary}dd 100%)` }}
      >
        <div className="flex items-center justify-between px-5 pb-4 pt-4">
          <div>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.62)" }}>
              {businessName}
            </p>
            <p className="mt-0.5 text-lg font-bold leading-tight" style={{ color: primaryForeground }}>
              Garson Sıralaması
            </p>
          </div>
          <button
            onClick={() => router.replace("/waiter")}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
            style={{
              background: "rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.82)",
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Geri
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-5">
        {dataLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-16 rounded-2xl bg-white animate-pulse"
                style={{ border: `1px solid ${borderSoft}` }}
              />
            ))}
          </div>
        ) : dataError ? (
          <div className="rounded-2xl bg-white p-8 text-center" style={{ border: `1px solid ${borderSoft}` }}>
            <p className="text-sm" style={{ color: "#c2410c" }}>
              {dataError}
            </p>
            <button
              onClick={() => router.refresh()}
              className="mt-4 rounded-lg px-4 py-2 text-xs"
              style={{ background: primary, color: primaryForeground }}
            >
              Tekrar Dene
            </button>
          </div>
        ) : waiters.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center" style={{ border: `1px solid ${borderSoft}` }}>
            <p className="text-sm text-gray-400">Garson bulunamadı.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {waiters.map((waiter, index) => {
              const isMe = waiter.uid === profile.uid;
              const online = presence[waiter.uid]?.online;

              return (
                <div
                  key={waiter.uid}
                  className="flex items-center gap-4 rounded-2xl px-5 py-4"
                  style={{
                    background: isMe ? primary : "#fff",
                    border: `2px solid ${isMe ? primary : borderSoft}`,
                    boxShadow: isMe ? `0 18px 40px ${themePalette.primarySoft}` : undefined,
                  }}
                >
                  <div className="w-8 shrink-0 text-center">
                    <span
                      className="text-sm font-bold"
                      style={{ color: isMe ? "rgba(255,255,255,0.7)" : muted }}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{
                      background: isMe ? "rgba(255,255,255,0.16)" : surfaceMuted,
                      color: isMe ? primaryForeground : muted,
                    }}
                  >
                    {waiter.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className="truncate text-sm font-semibold"
                        style={{ color: isMe ? primaryForeground : text }}
                      >
                        {waiter.name}
                      </p>
                      {isMe && (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-xs"
                          style={{ background: "rgba(255,255,255,0.16)", color: primaryForeground }}
                        >
                          Sen
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? "bg-green-400" : "bg-gray-300"}`} />
                      <p
                        className="text-xs"
                        style={{ color: isMe ? "rgba(255,255,255,0.7)" : muted }}
                      >
                        {(waiter.avgRating ?? 0) > 0 ? `${waiter.avgRating!.toFixed(1)} ★` : "—"}
                        {!online && presence[waiter.uid]?.lastSeen
                          ? ` · ${formatLastSeen(presence[waiter.uid].lastSeen)}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className="text-xl font-bold leading-none"
                      style={{ color: isMe ? primaryForeground : text }}
                    >
                      {waiter.totalCalls ?? 0}
                    </p>
                    <p
                      className="mt-0.5 text-xs"
                      style={{ color: isMe ? "rgba(255,255,255,0.7)" : muted }}
                    >
                      çağrı
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
