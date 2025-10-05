import apiUrl from "./api";
import { normalizeApiRecord } from "./collectionRecords";
import type {
  CommunityUserSummary,
  PublicUserProfile,
  Record as MrcRecord,
} from "./types";

type AnyObject = { [key: string]: unknown };

function isObject(value: unknown): value is AnyObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(record: MrcRecord): MrcRecord {
  return {
    ...record,
    tags: [...record.tags],
  };
}

function cloneRecords(records: MrcRecord[]): MrcRecord[] {
  return records.map((record) => cloneRecord(record));
}

function normalizeProfilePicUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return apiUrl(normalized);
}

function normalizeUserSummary(raw: AnyObject): CommunityUserSummary {
  const username = typeof raw.username === "string" ? raw.username : "";
  const displayName =
    typeof raw.displayName === "string" && raw.displayName.trim()
      ? raw.displayName
      : null;
  const profilePicUrl = normalizeProfilePicUrl(raw.profilePicUrl);
  return {
    username,
    displayName,
    profilePicUrl,
  };
}

function normalizeRecords(raw: unknown): MrcRecord[] {
  if (!Array.isArray(raw)) return [];
  const normalized: MrcRecord[] = [];
  for (const item of raw) {
    const record = normalizeApiRecord(item);
    if (record) {
      normalized.push(record);
    }
  }
  return normalized;
}

const searchCache = new Map<string, CommunityUserSummary[]>();
const searchInFlight = new Map<string, Promise<CommunityUserSummary[]>>();

export async function searchCommunityUsers(
  query: string
): Promise<CommunityUserSummary[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }
  const normalized = trimmed.toLowerCase();
  if (searchCache.has(normalized)) {
    return searchCache.get(normalized)!.map((item) => ({ ...item }));
  }
  if (searchInFlight.has(normalized)) {
    return searchInFlight.get(normalized)!;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(
        apiUrl(`/api/community/search?q=${encodeURIComponent(trimmed)}`),
        { credentials: "include" }
      );
      if (!res.ok) {
        const message = await res
          .json()
          .catch(() => ({}))
          .then((data: any) => data?.error || "Failed to search users");
        const error = new Error(message);
        (error as any).status = res.status;
        throw error;
      }
      const data = (await res.json().catch(() => [])) as unknown[];
      const normalizedResults = data
        .filter((item): item is AnyObject => isObject(item))
        .map((item) => normalizeUserSummary(item));
      const cachedResults = normalizedResults.map((item) => ({ ...item }));
      searchCache.set(normalized, cachedResults);
      return normalizedResults.map((item) => ({ ...item }));
    } finally {
      searchInFlight.delete(normalized);
    }
  })();

  searchInFlight.set(normalized, fetchPromise);
  return fetchPromise;
}

const profileCache = new Map<string, PublicUserProfile>();
const profileInFlight = new Map<string, Promise<PublicUserProfile>>();

export async function loadPublicUserProfile(
  username: string
): Promise<PublicUserProfile> {
  const key = username.trim().toLowerCase();
  if (!key) {
    const error = new Error("Username is required");
    (error as any).status = 400;
    throw error;
  }
  if (profileCache.has(key)) {
    const cached = profileCache.get(key)!;
    return {
      ...cached,
      highlights: cloneRecords(cached.highlights),
      recentRecords: cloneRecords(cached.recentRecords),
    };
  }
  if (profileInFlight.has(key)) {
    return profileInFlight.get(key)!;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(apiUrl(`/api/community/users/${username}`), {
        credentials: "include",
      });
      if (!res.ok) {
        const message = await res
          .json()
          .catch(() => ({}))
          .then((data: any) => data?.error || "Failed to load user profile");
        const error = new Error(message);
        (error as any).status = res.status;
        throw error;
      }
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const normalizedProfile: PublicUserProfile = {
        username: typeof data.username === "string" ? data.username : username,
        displayName:
          typeof data.displayName === "string" && data.displayName.trim()
            ? data.displayName
            : null,
        bio:
          typeof data.bio === "string" && data.bio.trim().length > 0
            ? data.bio.trim()
            : null,
        profilePicUrl: normalizeProfilePicUrl(data.profilePicUrl),
        highlights: normalizeRecords(data.highlights),
        recentRecords: normalizeRecords(data.recentRecords),
      };
      profileCache.set(key, {
        ...normalizedProfile,
        highlights: cloneRecords(normalizedProfile.highlights),
        recentRecords: cloneRecords(normalizedProfile.recentRecords),
      });
      return normalizedProfile;
    } finally {
      profileInFlight.delete(key);
    }
  })();

  profileInFlight.set(key, fetchPromise);
  return fetchPromise;
}

const collectionCache = new Map<string, MrcRecord[]>();
const collectionInFlight = new Map<string, Promise<MrcRecord[]>>();

export async function loadPublicUserCollection(
  username: string,
  tableName?: string
): Promise<MrcRecord[]> {
  const normalizedUser = username.trim().toLowerCase();
  if (!normalizedUser) {
    const error = new Error("Username is required");
    (error as any).status = 400;
    throw error;
  }
  const tableKey = tableName?.trim() || "";
  const cacheKey = `${normalizedUser}::${tableKey.toLowerCase()}`;
  if (collectionCache.has(cacheKey)) {
    return cloneRecords(collectionCache.get(cacheKey)!);
  }
  if (collectionInFlight.has(cacheKey)) {
    return collectionInFlight.get(cacheKey)!;
  }

  const searchParams = new URLSearchParams();
  if (tableKey) {
    searchParams.set("table", tableKey);
  }
  const query = searchParams.toString();

  const fetchPromise = (async () => {
    try {
      const res = await fetch(
        apiUrl(
          `/api/community/users/${username}/collection${
            query ? `?${query}` : ""
          }`
        ),
        { credentials: "include" }
      );
      if (!res.ok) {
        const message = await res
          .json()
          .catch(() => ({}))
          .then((data: any) => data?.error || "Failed to load collection");
        const error = new Error(message);
        (error as any).status = res.status;
        throw error;
      }
      const data = await res.json().catch(() => []);
      const normalized = normalizeRecords(data);
      collectionCache.set(cacheKey, cloneRecords(normalized));
      return normalized;
    } finally {
      collectionInFlight.delete(cacheKey);
    }
  })();

  collectionInFlight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export function clearCommunityCaches(): void {
  searchCache.clear();
  searchInFlight.clear();
  profileCache.clear();
  profileInFlight.clear();
  collectionCache.clear();
  collectionInFlight.clear();
}
