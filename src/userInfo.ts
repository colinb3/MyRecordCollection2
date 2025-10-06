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
      const rawBio = typeof data.bio === "string" ? data.bio : "";
      const bio = rawBio.trim().length > 0 ? rawBio : null;
      const rawProfilePic =
        typeof data.profilePicUrl === "string" ? data.profilePicUrl.trim() : "";
      let profilePicUrl: string | null = null;
      if (rawProfilePic) {
        if (rawProfilePic.startsWith("http://") || rawProfilePic.startsWith("https://")) {
          profilePicUrl = rawProfilePic;
        } else {
          const normalizedPath = rawProfilePic.startsWith("/")
            ? rawProfilePic
            : `/${rawProfilePic}`;
          profilePicUrl = apiUrl(normalizedPath);
        }
      }
      const rawJoinedDate =
        typeof data.joinedDate === "string" ? data.joinedDate.trim() : "";
      const joinedDate = rawJoinedDate ? rawJoinedDate.slice(0, 10) : null;
      const followersCountRaw = Number((data as Record<string, unknown>).followersCount);
      const followersCount = Number.isFinite(followersCountRaw)
        ? Math.max(0, Math.trunc(followersCountRaw))
        : 0;
      const followingCountRaw = Number((data as Record<string, unknown>).followingCount);
      const followingCount = Number.isFinite(followingCountRaw)
        ? Math.max(0, Math.trunc(followingCountRaw))
        : 0;
      if (!username || !userUuid) {
        throw new Error("Invalid user info payload");
      }
      const normalized: UserInfo = {
        username,
        displayName,
        userUuid,
        bio,
        profilePicUrl,
        followersCount,
        followingCount,
        joinedDate,
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
