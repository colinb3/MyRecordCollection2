import apiUrl from "./api";

let cachedTags: string[] | null = null;
let inFlight: Promise<string[] | null> | null = null;

function clone(tags: string[] | null): string[] | null {
  if (!tags) return null;
  return [...tags];
}

export function getCachedTags(): string[] | null {
  return clone(cachedTags);
}

export function setCachedTags(tags: string[] | null): void {
  cachedTags = tags ? [...tags] : null;
}

export function clearTagsCache(): void {
  cachedTags = null;
  inFlight = null;
}

export async function loadUserTags(
  forceRefresh = false
): Promise<string[] | null> {
  if (!forceRefresh && cachedTags) {
    return clone(cachedTags);
  }

  if (!forceRefresh && inFlight) {
    return inFlight;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(apiUrl("/api/tags"), {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          cachedTags = null;
          return null;
        }
        throw new Error(`Failed to load tags (${res.status})`);
      }
      const raw = (await res.json().catch(() => [])) as unknown[];
      const tags = raw
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      
      cachedTags = tags;
      return clone(tags);
    } catch (error) {
      console.error("Failed to fetch tags", error);
      cachedTags = null;
      return null;
    } finally {
      inFlight = null;
    }
  })();

  inFlight = fetchPromise;
  return fetchPromise;
}

// Helper to update cache after tag operations
export function updateTagsCache(newTags: string[]): void {
  cachedTags = [...newTags];
}
