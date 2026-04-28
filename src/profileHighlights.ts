/**
 * @author Colin Brown
 * @description Profile highlights caching and management utility for user profile showcase records
 * @fileformat TypeScript
 */

import apiUrl from "./api";
import type { Record as MrcRecord, ProfileHighlights } from "./types";
import { normalizeApiRecord } from "./collectionRecords";

const MAX_HIGHLIGHTS = 3;

let cachedHighlights: ProfileHighlights | null = null;
let inFlight: Promise<ProfileHighlights | null> | null = null;

function cloneRecord(record: MrcRecord): MrcRecord {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { collectionName: _, ...rest } = record;
  return {
    ...rest,
    tags: [...record.tags],
  };
}

function cloneHighlights(
  data: ProfileHighlights | null
): ProfileHighlights | null {
  if (!data) return null;
  return {
    recordIds: [...data.recordIds],
  records: data.records.map((record: MrcRecord) => cloneRecord(record)),
  };
}

function normalizeHighlights(response: unknown): ProfileHighlights {
  const payload = (response as Record<string, unknown>) || {};

  const rawIds = Array.isArray(payload.recordIds) ? payload.recordIds : [];
  const recordIds = rawIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, MAX_HIGHLIGHTS);

  const rawRecords = Array.isArray(payload.records) ? payload.records : [];
  let records = rawRecords
    .map((item) => normalizeApiRecord(item))
    .filter((record): record is MrcRecord => record !== null);

  if (recordIds.length > 0) {
    const mapById = new Map<number, MrcRecord>();
    records.forEach((record) => {
      mapById.set(record.id, record);
    });
    const ordered: MrcRecord[] = [];
    recordIds.forEach((id) => {
      const match = mapById.get(id);
      if (match) {
        ordered.push(match);
      }
    });
    if (ordered.length > 0) {
      const extras = records.filter(
        (record) => !recordIds.includes(record.id)
      );
      records = [...ordered, ...extras];
    }
  }

  return {
    recordIds: recordIds.slice(0, MAX_HIGHLIGHTS),
    records: records.slice(0, MAX_HIGHLIGHTS),
  };
}

export function getCachedProfileHighlights(): ProfileHighlights | null {
  return cloneHighlights(cachedHighlights);
}

export function setCachedProfileHighlights(
  data: ProfileHighlights | null
): void {
  cachedHighlights = cloneHighlights(data);
}

export async function loadProfileHighlights(
  forceRefresh = false
): Promise<ProfileHighlights | null> {
  if (!forceRefresh && cachedHighlights) {
    return cloneHighlights(cachedHighlights);
  }

  if (!forceRefresh && inFlight) {
    return inFlight;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(apiUrl("/api/profile/highlights"), {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 404) {
          cachedHighlights = { recordIds: [], records: [] };
          return cloneHighlights(cachedHighlights);
        }
        throw new Error(`Failed to load profile highlights (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      const normalized = normalizeHighlights(data);
      cachedHighlights = normalized;
      return cloneHighlights(normalized);
    } catch (error) {
      console.warn("Failed to load profile highlights", error);
      return null;
    } finally {
      inFlight = null;
    }
  })();

  if (!forceRefresh) {
    inFlight = fetchPromise;
  }

  return fetchPromise;
}

export function clearProfileHighlightsCache(): void {
  cachedHighlights = null;
  inFlight = null;
}
