/**
 * @author Colin Brown
 * @description Record table preferences management and caching utility for storing user column visibility and sorting preferences
 * @fileformat TypeScript
 */

import apiUrl from "./api";
import {
  createDefaultColumnVisibility,
  createDefaultRecordTablePreferences,
  RECORD_TABLE_COLUMNS,
  SORTABLE_RECORD_TABLE_COLUMNS,
  type ColumnVisibilityMap,
  type RecordTablePreferences,
  type RecordTableSortPreference,
} from "./types";

let cachedPreferences: RecordTablePreferences | null = null;
let inFlight: Promise<RecordTablePreferences> | null = null;

function normalizePreferences(raw: unknown): RecordTablePreferences {
  const defaults = createDefaultRecordTablePreferences();
  const visibility: ColumnVisibilityMap = {
    ...createDefaultColumnVisibility(),
  };
  let defaultSort: RecordTableSortPreference = { ...defaults.defaultSort };

  if (raw && typeof raw === "object") {
    const rawAny = raw as Record<string, unknown>;
    const rawVisibility = rawAny.columnVisibility as
      | Record<string, unknown>
      | undefined;
    if (rawVisibility && typeof rawVisibility === "object") {
      for (const column of RECORD_TABLE_COLUMNS) {
        const value = rawVisibility[column.key];
        if (typeof value === "boolean") {
          visibility[column.key] = value;
        }
      }
    }

    const rawSort = rawAny.defaultSort as
      | Record<string, unknown>
      | undefined;
    if (
      rawSort &&
      typeof rawSort === "object" &&
      typeof rawSort.field === "string" &&
      (rawSort.order === "asc" || rawSort.order === "desc") &&
      SORTABLE_RECORD_TABLE_COLUMNS.some((column) => column.key === rawSort.field)
    ) {
      defaultSort = {
        field: rawSort.field as RecordTableSortPreference["field"],
        order: rawSort.order,
      };
    }
  }

  visibility.record = true;

  return {
    columnVisibility: visibility,
    defaultSort,
  };
}

export function getCachedRecordTablePreferences(): RecordTablePreferences | null {
  if (!cachedPreferences) return null;
  return {
    columnVisibility: { ...cachedPreferences.columnVisibility },
    defaultSort: { ...cachedPreferences.defaultSort },
  };
}

export function setCachedRecordTablePreferences(prefs: RecordTablePreferences): void {
  cachedPreferences = normalizePreferences(prefs);
}

export async function loadRecordTablePreferences(
  forceRefresh = false
): Promise<RecordTablePreferences> {
  if (!forceRefresh && cachedPreferences) {
    return {
      ...cachedPreferences,
      columnVisibility: { ...cachedPreferences.columnVisibility },
    };
  }

  if (!forceRefresh && inFlight) {
    return inFlight;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(apiUrl("/api/preferences/record-table"), {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to load preferences (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      const normalized = normalizePreferences(data);
      cachedPreferences = normalized;
      return {
        ...normalized,
        columnVisibility: { ...normalized.columnVisibility },
        defaultSort: { ...normalized.defaultSort },
      };
    } catch (error) {
      console.warn("Falling back to default record table preferences", error);
      const defaults = createDefaultRecordTablePreferences();
      return {
        ...defaults,
        columnVisibility: { ...defaults.columnVisibility },
        defaultSort: { ...defaults.defaultSort },
      };
    } finally {
      inFlight = null;
    }
  })();

  if (!forceRefresh) {
    inFlight = fetchPromise;
  }

  const prefs = await fetchPromise;
  return {
    columnVisibility: { ...prefs.columnVisibility },
    defaultSort: { ...prefs.defaultSort },
  };
}

export function clearRecordTablePreferencesCache(): void {
  cachedPreferences = null;
  inFlight = null;
}
