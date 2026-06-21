import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db, LEGACY_RESTAURANT_IDS } from "@/lib/firebase";

export type ResolvedRestaurant = {
  id: string;
  slug: string | null;
  name: string | null;
};

export async function resolveRestaurantBySlugOrId(
  slugOrId: string,
): Promise<ResolvedRestaurant | null> {
  const directRef = doc(db, "restaurants", slugOrId);
  const directSnap = await getDoc(directRef);

  if (directSnap.exists()) {
    const data = directSnap.data();
    return {
      id: directSnap.id,
      slug: typeof data.slug === "string" ? data.slug : null,
      name: typeof data.name === "string" ? data.name : null,
    };
  }

  const slugQuery = query(
    collection(db, "restaurants"),
    where("slug", "==", slugOrId.toLowerCase()),
    limit(1),
  );
  const slugSnap = await getDocs(slugQuery);

  if (!slugSnap.empty) {
    const matchedDoc = slugSnap.docs[0];
    const data = matchedDoc.data();
    return {
      id: matchedDoc.id,
      slug: typeof data.slug === "string" ? data.slug : null,
      name: typeof data.name === "string" ? data.name : null,
    };
  }

  const settingsRef = doc(db, "restaurants", slugOrId, "settings", "general");
  const settingsSnap = await getDoc(settingsRef);

  if (settingsSnap.exists()) {
    const data = settingsSnap.data();
    return {
      id: slugOrId,
      slug: typeof data.slug === "string" ? data.slug : null,
      name: typeof data.businessName === "string" ? data.businessName : null,
    };
  }

  if (LEGACY_RESTAURANT_IDS.includes(slugOrId as (typeof LEGACY_RESTAURANT_IDS)[number])) {
    for (const legacyId of LEGACY_RESTAURANT_IDS) {
      const legacySnap = await getDoc(doc(db, "restaurants", legacyId));
      if (!legacySnap.exists()) continue;

      const data = legacySnap.data();
      return {
        id: legacySnap.id,
        slug: typeof data.slug === "string" ? data.slug : null,
        name: typeof data.name === "string" ? data.name : null,
      };
    }
  }

  return null;
}
