// User lists caching utility
// Manages a client-side cache of user lists to reduce server calls

export interface UserListSummary {
  id: number;
  name: string;
  isPrivate: boolean;
  recordCount: number;
  pictureUrl: string | null;
}

interface CacheEntry {
  lists: UserListSummary[];
  timestamp: number;
}

const CACHE_KEY = "mrc_user_lists_cache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let memoryCache: CacheEntry | null = null;

/**
 * Get cached user lists from memory or localStorage
 */
export function getCachedUserLists(): UserListSummary[] | null {
  // Check memory cache first
  if (memoryCache) {
    const age = Date.now() - memoryCache.timestamp;
    if (age < CACHE_DURATION) {
      return memoryCache.lists;
    }
    memoryCache = null;
  }

  // Check localStorage
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const parsed: CacheEntry = JSON.parse(stored);
      const age = Date.now() - parsed.timestamp;
      if (age < CACHE_DURATION) {
        memoryCache = parsed;
        return parsed.lists;
      }
      // Expired, clear it
      localStorage.removeItem(CACHE_KEY);
    }
  } catch (error) {
    console.warn("Failed to read user lists cache:", error);
    localStorage.removeItem(CACHE_KEY);
  }

  return null;
}

/**
 * Store user lists in cache
 */
export function setCachedUserLists(lists: UserListSummary[]): void {
  const entry: CacheEntry = {
    lists,
    timestamp: Date.now(),
  };

  memoryCache = entry;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch (error) {
    console.warn("Failed to cache user lists:", error);
  }
}

/**
 * Update a single list in the cache
 */
export function updateCachedList(
  listId: number,
  updates: Partial<UserListSummary>
): void {
  const cached = getCachedUserLists();
  if (!cached) return;

  const index = cached.findIndex((list) => list.id === listId);
  if (index !== -1) {
    cached[index] = { ...cached[index], ...updates };
    setCachedUserLists(cached);
  }
}

/**
 * Add a new list to the cache
 */
export function addCachedList(list: UserListSummary): void {
  const cached = getCachedUserLists();
  if (cached) {
    setCachedUserLists([...cached, list]);
  } else {
    // If no cache exists, don't create one with just this list
    // Let the next full fetch populate it
  }
}

/**
 * Remove a list from the cache
 */
export function removeCachedList(listId: number): void {
  const cached = getCachedUserLists();
  if (!cached) return;

  const filtered = cached.filter((list) => list.id !== listId);
  setCachedUserLists(filtered);
}

/**
 * Clear the user lists cache
 */
export function clearUserListsCache(): void {
  memoryCache = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn("Failed to clear user lists cache:", error);
  }
}

/**
 * Fetch user lists from server and update cache
 */
export async function loadUserLists(apiUrl: string): Promise<UserListSummary[]> {
  try {
    const response = await fetch(apiUrl, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch user lists");
    }

    const data = await response.json();
    const lists = Array.isArray(data?.lists) ? data.lists : [];
    
    // Cache the results
    setCachedUserLists(lists);
    
    return lists;
  } catch (error) {
    console.error("Failed to load user lists:", error);
    throw error;
  }
}
