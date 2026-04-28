/**
 * @author Colin Brown
 * @description User lists caching utility that maintains a cache of user list names for the MasterRecord page
 * @fileformat TypeScript
 */

// User lists caching utility
// Manages a minimal cache of user list names for the MasterRecord page

export interface UserListName {
  id: number;
  name: string;
}

interface CacheEntry {
  lists: UserListName[];
  timestamp: number;
}

const CACHE_KEY = "mrc_user_lists_cache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let memoryCache: CacheEntry | null = null;

/**
 * Get cached user list names from memory or localStorage
 */
export function getCachedUserLists(): UserListName[] | null {
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
 * Store user list names in cache
 */
export function setCachedUserLists(lists: UserListName[]): void {
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
 * Add a new list to the cache
 */
export function addCachedList(list: UserListName): void {
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
