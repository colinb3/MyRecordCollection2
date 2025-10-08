import apiUrl from "./api";
import type { Record as MrcRecord } from "./types";
import { normalizeApiRecord } from "./collectionRecords";

export const PROFILE_RECENT_DEFAULT_LIMIT = 3;
const PROFILE_RECENT_MAX_LIMIT = 20;

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return PROFILE_RECENT_DEFAULT_LIMIT;
  const int = Math.floor(limit);
  if (int <= 0) return PROFILE_RECENT_DEFAULT_LIMIT;
  return Math.min(int, PROFILE_RECENT_MAX_LIMIT);
}

export async function loadRecentRecords(
  limit: number = PROFILE_RECENT_DEFAULT_LIMIT
): Promise<MrcRecord[]> {
  const normalizedLimit = clampLimit(limit);
  const params = new URLSearchParams({ limit: String(normalizedLimit) });

  const res = await fetch(apiUrl(`/api/profile/recent?${params.toString()}`), {
    credentials: "include",
  });

  if (!res.ok) {
    if (res.status === 404) {
      return [];
    }
    throw new Error(`Failed to load recent records (${res.status})`);
  }

  const data = await res.json().catch(() => []);
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => normalizeApiRecord(item))
    .filter((item): item is MrcRecord => item !== null)
    .slice(0, normalizedLimit)
    .map((record) => ({ ...record, tags: [...record.tags] }));
}
