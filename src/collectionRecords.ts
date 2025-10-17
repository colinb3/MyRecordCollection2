import apiUrl from "./api";
import type { Record as MrcRecord } from "./types";

export const DEFAULT_COLLECTION_NAME = "My Collection";

function cloneRecord(record: MrcRecord): MrcRecord {
  const { collectionName: _ignored, ...rest } = record;
  return {
    ...rest,
    tags: [...record.tags],
  };
}

function cloneRecords(records: MrcRecord[]): MrcRecord[] {
  return records.map((record) => cloneRecord(record));
}

export function normalizeApiRecord(raw: unknown): MrcRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const id = Number(source.id);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const recordName =
    typeof source.record === "string" && source.record
      ? source.record
      : typeof source.name === "string"
      ? source.name
      : "";

  const artist =
    typeof source.artist === "string" ? source.artist : "Unknown Artist";

  const ratingRaw = Number(source.rating);
  const rating = Number.isFinite(ratingRaw) ? ratingRaw : 0;

  const tagsRaw = source.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.filter((tag): tag is string => typeof tag === "string")
    : [];

  const releaseRaw =
    source.release !== undefined ? source.release : source.release_year;
  const releaseValue = Number(releaseRaw);
  const release = Number.isFinite(releaseValue) ? releaseValue : 0;

  const added =
    typeof source.added === "string"
      ? source.added
      : typeof source.dateAdded === "string"
      ? source.dateAdded
      : "";

  const cover =
    typeof source.cover === "string" && source.cover ? source.cover : undefined;

  const tableIdRaw = Number(source.tableId);
  const tableId = Number.isInteger(tableIdRaw) ? tableIdRaw : undefined;

  const masterIdRaw = source.masterId;
  const masterIdNum = Number(masterIdRaw);
  const masterId =
    Number.isInteger(masterIdNum) && masterIdNum > 0 ? masterIdNum : null;

  const review =
    typeof source.review === "string" && source.review.trim()
      ? source.review.trim()
      : null;

  const rawIsCustom = source.isCustom;
  const isCustom =
    rawIsCustom === true ||
    rawIsCustom === 1 ||
    rawIsCustom === "1" ||
    rawIsCustom === "true";

  const normalized: MrcRecord = {
    id,
    record: recordName,
    artist,
    rating,
    isCustom,
    tags,
    release,
    added,
    tableId,
  };

  if (cover) {
    normalized.cover = cover;
  }

  if (masterId) {
    normalized.masterId = masterId;
  } else if (masterIdRaw === null) {
    normalized.masterId = null;
  }

  if (review !== null) {
    normalized.review = review;
  } else if (source.review === null) {
    normalized.review = null;
  }

  return normalized;
}

const collectionCache = new Map<string, MrcRecord[]>();
const collectionInFlight = new Map<string, Promise<MrcRecord[]>>();
let cachedAllRecords: MrcRecord[] | null = null;
let allInFlight: Promise<MrcRecord[]> | null = null;

export function getCachedCollectionRecords(
  tableName: string
): MrcRecord[] | null {
  const cached = collectionCache.get(tableName);
  if (!cached) return null;
  return cloneRecords(cached);
}

export async function loadCollectionRecords(
  tableName: string,
  forceRefresh = false
): Promise<MrcRecord[]> {
  const key = tableName.trim();
  if (!forceRefresh && collectionCache.has(key)) {
    return cloneRecords(collectionCache.get(key)!);
  }

  if (!forceRefresh && collectionInFlight.has(key)) {
    return collectionInFlight.get(key)!;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(
        apiUrl(`/api/records?table=${encodeURIComponent(key)}`),
        {
          credentials: "include",
        }
      );

      if (!res.ok) {
        if (res.status === 404) {
          collectionCache.set(key, []);
          return [] as MrcRecord[];
        }
        throw new Error(`Failed to load records for ${key} (${res.status})`);
      }

      const data = await res.json().catch(() => []);
      const normalized = Array.isArray(data)
    ? data
      .map((item) => normalizeApiRecord(item))
      .filter((item): item is MrcRecord => item !== null)
        : [];
      collectionCache.set(key, normalized);
      cachedAllRecords = null; // Invalidate aggregated cache
      return cloneRecords(normalized);
    } catch (error) {
      console.warn(`Failed to load collection '${key}'`, error);
      if (collectionCache.has(key)) {
        return cloneRecords(collectionCache.get(key)!);
      }
      throw error;
    } finally {
      collectionInFlight.delete(key);
    }
  })();

  if (!forceRefresh) {
    collectionInFlight.set(key, fetchPromise);
  }

  return fetchPromise;
}

export async function loadAllCollectionRecords(
  forceRefresh = false
): Promise<MrcRecord[]> {
  if (!forceRefresh && cachedAllRecords) {
    return cloneRecords(cachedAllRecords);
  }

  if (!forceRefresh && allInFlight) {
    return allInFlight;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(apiUrl("/api/collections"), {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to load collections (${res.status})`);
      }
      const data = (await res.json().catch(() => ({}))) as {
        collections?: unknown;
      };
      const rawCollections = data.collections;
      const collections = Array.isArray(rawCollections)
        ? rawCollections.filter(
            (name): name is string =>
              typeof name === "string" && name.trim().length > 0
          )
        : [];

      const recordsByCollection: MrcRecord[][] = await Promise.all(
        collections.map((name) => loadCollectionRecords(name, forceRefresh))
      );

      const combined: MrcRecord[] = [];
      recordsByCollection.forEach((records) => {
        combined.push(...records);
      });

      cachedAllRecords = combined;
      return cloneRecords(combined);
    } catch (error) {
      console.warn("Failed to load all collection records", error);
      cachedAllRecords = null;
      throw error;
    } finally {
      allInFlight = null;
    }
  })();

  if (!forceRefresh) {
    allInFlight = fetchPromise;
  }

  return fetchPromise;
}

export function clearCollectionRecordsCache(): void {
  collectionCache.clear();
  collectionInFlight.clear();
  cachedAllRecords = null;
  allInFlight = null;
}
