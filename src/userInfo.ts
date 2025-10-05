import apiUrl from "./api";
import type { UserInfo } from "./types";

let cachedUserInfo: UserInfo | null = null;
let inFlight: Promise<UserInfo | null> | null = null;

function clone(info: UserInfo | null): UserInfo | null {
  if (!info) return null;
  return { ...info };
}

export function getCachedUserInfo(): UserInfo | null {
  return clone(cachedUserInfo);
}

export function setCachedUserInfo(info: UserInfo | null): void {
  cachedUserInfo = info ? { ...info } : null;
}

export async function loadUserInfo(
  forceRefresh = false
): Promise<UserInfo | null> {
  if (!forceRefresh && cachedUserInfo) {
    return clone(cachedUserInfo);
  }

  if (!forceRefresh && inFlight) {
    return inFlight;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(apiUrl("/api/me"), {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          cachedUserInfo = null;
          return null;
        }
        throw new Error(`Failed to load user info (${res.status})`);
      }
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const username = typeof data.username === "string" ? data.username : "";
      const displayName =
        typeof data.displayName === "string" ? data.displayName : null;
      const userUuid = typeof data.userUuid === "string" ? data.userUuid : "";
      if (!username || !userUuid) {
        throw new Error("Invalid user info payload");
      }
      const normalized: UserInfo = {
        username,
        displayName,
        userUuid,
      };
      cachedUserInfo = normalized;
      return { ...normalized };
    } catch (error) {
      console.warn("Failed to load user info", error);
      cachedUserInfo = null;
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

export function clearUserInfoCache(): void {
  cachedUserInfo = null;
  inFlight = null;
}
