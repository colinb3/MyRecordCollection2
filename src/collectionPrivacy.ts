import apiUrl from "./api";

const DEFAULT_COLLECTION_NAME = "My Collection";
const WISHLIST_COLLECTION_NAME = "Wishlist";

export interface CollectionPrivacyEntry {
  tableName: string;
  isPrivate: boolean;
}

export interface CollectionPrivacyState {
  collection: CollectionPrivacyEntry;
  wishlist: CollectionPrivacyEntry;
}

const DEFAULT_PRIVACY_STATE: CollectionPrivacyState = {
  collection: {
    tableName: DEFAULT_COLLECTION_NAME,
    isPrivate: false,
  },
  wishlist: {
    tableName: WISHLIST_COLLECTION_NAME,
    isPrivate: true,
  },
};

let cachedPrivacy: CollectionPrivacyState | null = null;
let inFlightPrivacy: Promise<CollectionPrivacyState> | null = null;

function normalizeEntry(
  raw: unknown,
  fallback: CollectionPrivacyEntry
): CollectionPrivacyEntry {
  if (!raw || typeof raw !== "object") {
    return { ...fallback };
  }

  const value = raw as Record<string, unknown>;
  const rawName =
    typeof value.tableName === "string" && value.tableName.trim()
      ? value.tableName.trim()
      : fallback.tableName;
  const rawPrivate = value.isPrivate;
  let isPrivate: boolean;
  if (typeof rawPrivate === "boolean") {
    isPrivate = rawPrivate;
  } else if (typeof rawPrivate === "number") {
    isPrivate = rawPrivate === 1;
  } else if (typeof rawPrivate === "string") {
    const normalized = rawPrivate.trim().toLowerCase();
    isPrivate = normalized === "true" || normalized === "1";
  } else {
    isPrivate = fallback.isPrivate;
  }

  return {
    tableName: rawName,
    isPrivate,
  };
}

function normalizePrivacy(raw: unknown): CollectionPrivacyState {
  if (!raw || typeof raw !== "object") {
    return {
      collection: { ...DEFAULT_PRIVACY_STATE.collection },
      wishlist: { ...DEFAULT_PRIVACY_STATE.wishlist },
    };
  }

  const obj = raw as Record<string, unknown>;

  // Handle legacy single-table response { tableName, isPrivate }
  if (typeof obj.tableName === "string" && "isPrivate" in obj) {
    const entry = normalizeEntry(obj, DEFAULT_PRIVACY_STATE.collection);
    const wishlistEntry = { ...DEFAULT_PRIVACY_STATE.wishlist };
    return {
      collection: entry,
      wishlist: wishlistEntry,
    };
  }

  const collectionEntry = normalizeEntry(
    obj.collection,
    DEFAULT_PRIVACY_STATE.collection
  );
  const wishlistEntry = normalizeEntry(
    obj.wishlist,
    DEFAULT_PRIVACY_STATE.wishlist
  );

  return {
    collection: collectionEntry,
    wishlist: wishlistEntry,
  };
}

function clonePrivacy(state: CollectionPrivacyState): CollectionPrivacyState {
  return {
    collection: { ...state.collection },
    wishlist: { ...state.wishlist },
  };
}

export function getCachedCollectionPrivacy(): CollectionPrivacyState | null {
  if (!cachedPrivacy) {
    return null;
  }
  return clonePrivacy(cachedPrivacy);
}

export function setCachedCollectionPrivacy(
  state: CollectionPrivacyState
): void {
  cachedPrivacy = normalizePrivacy(state);
}

export function clearCollectionPrivacyCache(): void {
  cachedPrivacy = null;
  inFlightPrivacy = null;
}

export async function loadCollectionPrivacy(
  forceRefresh = false
): Promise<CollectionPrivacyState> {
  if (!forceRefresh && cachedPrivacy) {
    return clonePrivacy(cachedPrivacy);
  }

  if (!forceRefresh && inFlightPrivacy) {
    return inFlightPrivacy.then(clonePrivacy);
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(apiUrl("/api/collections/privacy"), {
        credentials: "include",
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: unknown;
        collection?: unknown;
        wishlist?: unknown;
        tableName?: unknown;
        isPrivate?: unknown;
      };
      if (!res.ok) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : `Failed to load collection privacy (${res.status})`;
        throw new Error(message);
      }
      const normalized = normalizePrivacy(payload);
      cachedPrivacy = normalized;
      return clonePrivacy(normalized);
    } finally {
      inFlightPrivacy = null;
    }
  })();

  if (!forceRefresh) {
    inFlightPrivacy = fetchPromise;
  }

  const privacy = await fetchPromise;
  return clonePrivacy(privacy);
}

export function updateCollectionPrivacyCache(
  tableName: string,
  isPrivate: boolean
): void {
  const normalizedName = tableName.trim().toLowerCase();
  const base = cachedPrivacy
    ? clonePrivacy(cachedPrivacy)
    : clonePrivacy(DEFAULT_PRIVACY_STATE);

  if (base.collection.tableName.trim().toLowerCase() === normalizedName) {
    base.collection.isPrivate = isPrivate;
  } else if (base.wishlist.tableName.trim().toLowerCase() === normalizedName) {
    base.wishlist.isPrivate = isPrivate;
  }

  cachedPrivacy = normalizePrivacy(base);
}
