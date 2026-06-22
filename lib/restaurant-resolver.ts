export type ResolvedRestaurant = {
  id: string;
  slug: string | null;
  name: string | null;
  status: "active" | "passive";
  subscriptionExpiresAt: number | null;
};

export async function resolveRestaurantBySlugOrId(
  slugOrId: string,
): Promise<ResolvedRestaurant | null> {
  const normalizedSlugOrId = slugOrId.trim().toLowerCase();

  if (!normalizedSlugOrId) {
    return null;
  }

  try {
    const response = await fetch(`/api/public/restaurant-resolve?slugOrId=${encodeURIComponent(normalizedSlugOrId)}`, {
      cache: "no-store",
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("Restaurant resolve failed");
    }

    const payload = (await response.json()) as { restaurant?: ResolvedRestaurant };
    return payload.restaurant ?? null;
  } catch (error) {
    console.error("Restaurant resolve error:", error);
    return null;
  }
}
