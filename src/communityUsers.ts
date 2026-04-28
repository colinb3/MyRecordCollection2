/**
 * @author Colin Brown
 * @description Community users data fetching utility for retrieving community member information and feeds
 * @fileformat TypeScript
 */

import apiUrl from "./api";
import { normalizeApiRecord } from "./collectionRecords";
import type {
  CommunityUserSummary,
  CommunityFeedEntry,
  PublicUserProfile,
  Record as MrcRecord,
  UserFollowLists,
  PaginatedUserFollowLists,
} from "./types";

type AnyObject = { [key: string]: unknown };

interface ApiError extends Error {
  status?: number;
}

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

function normalizeCount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.trunc(num);
}

function normalizeDateString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return null;
}

function normalizeUserSummary(raw: AnyObject): CommunityUserSummary {
  const username = typeof raw.username === "string" ? raw.username : "";
  const displayName =
    typeof raw.displayName === "string" && raw.displayName.trim()
      ? raw.displayName
      : null;
  const profilePicUrl = normalizeProfilePicUrl(raw.profilePicUrl);
  const followersCount = normalizeCount(raw.followersCount);
  const followingCount = normalizeCount(raw.followingCount);
  return {
    username,
    displayName,
    profilePicUrl,
    followersCount,
    followingCount,
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

function cloneFeedEntry(entry: CommunityFeedEntry): CommunityFeedEntry {
  if (entry.type === 'record') {
    return {
      type: 'record',
      owner: { ...entry.owner },
      record: cloneRecord(entry.record),
    };
  }

  if (entry.type === 'liked-review') {
    return {
      type: 'liked-review',
      liker: { ...entry.liker },
      reviewOwner: { ...entry.reviewOwner },
      record: { ...entry.record },
      likedAt: entry.likedAt,
    };
  }

  if (entry.type === 'liked-list') {
    return {
      type: 'liked-list',
      liker: { ...entry.liker },
      listOwner: { ...entry.listOwner },
      list: { ...entry.list },
      likedAt: entry.likedAt,
    };
  }

  if (entry.type === 'listening-to') {
    return {
      type: 'listening-to',
      listener: { ...entry.listener },
      record: {
        masterId: entry.record.masterId,
        name: entry.record.name,
        artist: entry.record.artist,
        cover: entry.record.cover,
      },
      listeningAt: entry.listeningAt,
    };
  }

  // entry.type === 'list'
  const previews = Array.isArray(entry.previewRecords)
    ? entry.previewRecords.map((preview) => ({ ...preview }))
    : [];

  return {
    type: 'list',
    owner: { ...entry.owner },
    list: { ...entry.list },
    previewRecords: previews,
  };
}

function cloneFeedEntries(entries: CommunityFeedEntry[]): CommunityFeedEntry[] {
  return entries.map((entry) => cloneFeedEntry(entry));
}

function normalizeFeedEntry(raw: AnyObject): CommunityFeedEntry | null {
  const type = typeof raw.type === 'string' ? raw.type : 'record';

  // Handle liked-review entry
  if (type === 'liked-review') {
    const likerRaw = raw.liker;
    const reviewOwnerRaw = raw.reviewOwner;
    
    if (!isObject(likerRaw) || !isObject(reviewOwnerRaw)) {
      return null;
    }

    const likerObject = likerRaw as AnyObject;
    const likerUsername =
      typeof likerObject.username === "string" && likerObject.username.trim()
        ? likerObject.username.trim()
        : "";
    if (!likerUsername) {
      return null;
    }

    const ownerObject = reviewOwnerRaw as AnyObject;
    const ownerUsername =
      typeof ownerObject.username === "string" && ownerObject.username.trim()
        ? ownerObject.username.trim()
        : "";
    if (!ownerUsername) {
      return null;
    }

    const recordRaw = raw.record;
    if (!isObject(recordRaw)) {
      return null;
    }

    const recordObject = recordRaw as AnyObject;
    const recordId = Number(recordObject.id);
    const recordName = typeof recordObject.name === 'string' ? recordObject.name : '';
    const artist = typeof recordObject.artist === 'string' ? recordObject.artist : '';

    if (!Number.isInteger(recordId) || recordId <= 0 || !recordName) {
      return null;
    }

    return {
      type: 'liked-review',
      liker: {
        username: likerUsername,
        displayName:
          typeof likerObject.displayName === "string" &&
          likerObject.displayName.trim()
            ? likerObject.displayName
            : null,
        profilePicUrl: normalizeProfilePicUrl(likerObject.profilePicUrl),
      },
      reviewOwner: {
        username: ownerUsername,
        displayName:
          typeof ownerObject.displayName === "string" &&
          ownerObject.displayName.trim()
            ? ownerObject.displayName
            : null,
      },
      record: {
        id: recordId,
        name: recordName,
        artist: artist,
      },
      likedAt: typeof raw.likedAt === 'string' ? raw.likedAt : '',
    };
  }

  // Handle liked-list entry
  if (type === 'liked-list') {
    const likerRaw = raw.liker;
    const listOwnerRaw = raw.listOwner;
    
    if (!isObject(likerRaw) || !isObject(listOwnerRaw)) {
      return null;
    }

    const likerObject = likerRaw as AnyObject;
    const likerUsername =
      typeof likerObject.username === "string" && likerObject.username.trim()
        ? likerObject.username.trim()
        : "";
    if (!likerUsername) {
      return null;
    }

    const ownerObject = listOwnerRaw as AnyObject;
    const ownerUsername =
      typeof ownerObject.username === "string" && ownerObject.username.trim()
        ? ownerObject.username.trim()
        : "";
    if (!ownerUsername) {
      return null;
    }

    const listRaw = raw.list;
    if (!isObject(listRaw)) {
      return null;
    }
    const listObject = listRaw as AnyObject;
    const listId = Number(listObject.id);
    const listName = typeof listObject.name === 'string' ? listObject.name : '';

    if (!Number.isInteger(listId) || listId <= 0 || !listName) {
      return null;
    }
    
    return {
      type: 'liked-list',
      liker: {
        username: likerUsername,
        displayName:
          typeof likerObject.displayName === "string" &&
          likerObject.displayName.trim()
            ? likerObject.displayName
            : null,
        profilePicUrl: normalizeProfilePicUrl(likerObject.profilePicUrl),
      },
      listOwner: {
        username: ownerUsername,
        displayName:
          typeof ownerObject.displayName === "string" &&
          ownerObject.displayName.trim()
            ? ownerObject.displayName
            : null,
      },
      list: {
        id: listId,
        name: listName,
      },
      likedAt: typeof raw.likedAt === 'string' ? raw.likedAt : '',
    };
  }

  // Handle listening-to entry
  if (type === 'listening-to') {
    const listenerRaw = raw.listener;
    
    if (!isObject(listenerRaw)) {
      return null;
    }

    const listenerObject = listenerRaw as AnyObject;
    const listenerUsername =
      typeof listenerObject.username === "string" && listenerObject.username.trim()
        ? listenerObject.username.trim()
        : "";
    if (!listenerUsername) {
      return null;
    }

    const recordRaw = raw.record;
    if (!isObject(recordRaw)) {
      return null;
    }

    const recordObject = recordRaw as AnyObject;
    // masterId can be numeric string or 'r' prefixed string
    const masterId =
      typeof recordObject.masterId === 'string' && recordObject.masterId.trim()
        ? recordObject.masterId.trim()
        : typeof recordObject.masterId === 'number' && recordObject.masterId > 0
          ? String(recordObject.masterId)
          : null;
    const recordName = typeof recordObject.name === 'string' ? recordObject.name : '';
    const artist = typeof recordObject.artist === 'string' ? recordObject.artist : '';
    const cover = typeof recordObject.cover === 'string' && recordObject.cover.trim()
      ? recordObject.cover.trim()
      : null;

    if (!masterId || !recordName) {
      return null;
    }

    return {
      type: 'listening-to',
      listener: {
        username: listenerUsername,
        displayName:
          typeof listenerObject.displayName === "string" &&
          listenerObject.displayName.trim()
            ? listenerObject.displayName
            : null,
        profilePicUrl: normalizeProfilePicUrl(listenerObject.profilePicUrl),
      },
      record: {
        masterId: masterId,
        name: recordName,
        artist: artist,
        cover: cover,
      },
      listeningAt: typeof raw.listeningAt === 'string' ? raw.listeningAt : '',
    };
  }

  const ownerRaw = raw.owner;

  if (!isObject(ownerRaw)) {
    return null;
  }

  const ownerObject = ownerRaw as AnyObject;
  const ownerUsername =
    typeof ownerObject.username === "string" && ownerObject.username.trim()
      ? ownerObject.username.trim()
      : "";
  if (!ownerUsername) {
    return null;
  }

  const displayName =
    typeof ownerObject.displayName === "string" &&
    ownerObject.displayName.trim()
      ? ownerObject.displayName
      : null;

  const profilePicUrl = normalizeProfilePicUrl(ownerObject.profilePicUrl);

  const owner = {
    username: ownerUsername,
    displayName,
    profilePicUrl,
  };

  // Handle list entry
  if (type === 'list') {
    const listRaw = raw.list;
    if (!isObject(listRaw)) {
      return null;
    }
    const listObject = listRaw as AnyObject;
    const previewsRaw = Array.isArray(raw.previewRecords)
      ? raw.previewRecords
      : [];
    const previewRecords = previewsRaw
      .map((item) => {
        if (!isObject(item)) {
          return null;
        }
        const previewObject = item as AnyObject;
        const previewId = Number(previewObject.id);
        const name =
          typeof previewObject.name === "string" ? previewObject.name : "";
        const cover =
          typeof previewObject.cover === "string" && previewObject.cover.trim()
            ? previewObject.cover.trim()
            : null;
        const artist = typeof previewObject.artist === "string" ? previewObject.artist : "";
        return {
          id: Number.isInteger(previewId) && previewId > 0 ? previewId : 0,
          name,
          artist,
          cover,
        };
      })
      .filter(
        (item): item is {
          id: number;
          name: string;
          artist: string;
          cover: string | null;
        } => item !== null
      );
    
    return {
      type: 'list',
      owner,
      list: {
        id: Number(listObject.id) || 0,
        name: typeof listObject.name === 'string' ? listObject.name : '',
        description: typeof listObject.description === 'string' && listObject.description.trim()
          ? listObject.description
          : null,
        picture: typeof listObject.picture === 'string' && listObject.picture.trim()
          ? listObject.picture
          : null,
        recordCount: Number(listObject.recordCount) || 0,
        created: typeof listObject.created === 'string' ? listObject.created : '',
        likes: Number(listObject.likes) || 0,
        likedByCurrentUser: Boolean(listObject.likedByCurrentUser),
      },
      previewRecords,
    };
  }

  // Handle record entry
  const recordRaw = raw.record;
  if (!isObject(recordRaw)) {
    return null;
  }

  const recordObject = recordRaw as AnyObject;
  const record = normalizeApiRecord(recordObject);
  if (!record) {
    return null;
  }

  record.collectionName = null;

  if (!Array.isArray(record.tags)) {
    record.tags = [];
  }

  return {
    type: 'record',
    owner,
    record,
  };
}

const searchCache = new Map<string, CommunityUserSummary[]>();
const searchInFlight = new Map<string, Promise<CommunityUserSummary[]>>();

type ActivityScope = "friends" | "you";

const activityFeedCache = new Map<ActivityScope, CommunityFeedEntry[]>();
const activityFeedInFlight = new Map<
  string,
  Promise<CommunityFeedEntry[]>
>();

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
          .then((data: AnyObject) => (typeof data?.error === 'string' ? data.error : "Failed to search users"));
        const error: ApiError = new Error(message);
        error.status = res.status;
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

export async function loadActivityFeed(
  scope: ActivityScope = "friends",
  limit: number = 10,
  offset: number = 0
): Promise<CommunityFeedEntry[]> {
  const normalizedScope: ActivityScope = scope === "you" ? "you" : "friends";

  // Don't use cache for paginated requests
  if (offset === 0 && activityFeedCache.has(normalizedScope)) {
    return cloneFeedEntries(activityFeedCache.get(normalizedScope)!);
  }

  const cacheKey = `${normalizedScope}-${offset}`;
  if (activityFeedInFlight.has(cacheKey)) {
    return activityFeedInFlight
      .get(cacheKey)!
      .then((entries) => cloneFeedEntries(entries));
  }

  const fetchPromise = (async () => {
    const searchParams = new URLSearchParams();
    searchParams.set("scope", normalizedScope);
    searchParams.set("limit", limit.toString());
    searchParams.set("offset", offset.toString());
    const query = searchParams.toString();

    try {
      const res = await fetch(
        apiUrl(`/api/activity${query ? `?${query}` : ""}`),
        {
          credentials: "include",
        }
      );
      if (!res.ok) {
        const message = await res
          .json()
          .catch(() => ({}))
          .then((data: AnyObject) => (typeof data?.error === 'string' ? data.error : "Failed to load activity"));
        const error: ApiError = new Error(message);
        error.status = res.status;
        throw error;
      }

      const data = (await res.json().catch(() => [])) as unknown[];
      const normalized = data
        .filter((item): item is AnyObject => isObject(item))
        .map((item) => normalizeFeedEntry(item))
        .filter((item): item is CommunityFeedEntry => item !== null);

      if (offset === 0) {
        activityFeedCache.set(
          normalizedScope,
          cloneFeedEntries(normalized)
        );
      }
      return cloneFeedEntries(normalized);
    } finally {
      activityFeedInFlight.delete(cacheKey);
    }
  })();

  activityFeedInFlight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

const profileCache = new Map<string, PublicUserProfile>();
const profileInFlight = new Map<string, Promise<PublicUserProfile>>();

export async function loadPublicUserProfile(
  username: string,
  forceRefresh = false
): Promise<PublicUserProfile> {
  const key = username.trim().toLowerCase();
  if (!key) {
    const error: ApiError = new Error("Username is required");
    error.status = 400;
    throw error;
  }
  if (!forceRefresh) {
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
          .then((data: AnyObject) => (typeof data?.error === 'string' ? data.error : "Failed to load user profile"));
        const error: ApiError = new Error(message);
        error.status = res.status;
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
        collectionCount: normalizeCount(data.collectionCount),
        wishlistCount: normalizeCount(data.wishlistCount),
        listenedCount: normalizeCount(data.listenedCount),
        followersCount: normalizeCount(data.followersCount),
        followingCount: normalizeCount(data.followingCount),
        isFollowing:
          typeof data.isFollowing === "boolean"
            ? data.isFollowing
            : null,
        joinedDate: normalizeDateString(data.joinedDate),
        collectionPrivate: Boolean(data.collectionPrivate),
        wishlistPrivate: Boolean(data.wishlistPrivate ?? true),
        listenedPrivate: Boolean(data.listenedPrivate ?? false),
        listeningTo:
          data.listeningTo && typeof data.listeningTo === "object"
            ? (() => {
                const lt = data.listeningTo as AnyObject;
                return {
                  artist:
                    typeof lt.artist === "string" && lt.artist.trim()
                      ? lt.artist.trim()
                      : null,
                  cover:
                    typeof lt.cover === "string" && lt.cover.trim()
                      ? lt.cover.trim()
                      : null,
                  name:
                    typeof lt.name === "string" && lt.name.trim()
                      ? lt.name.trim()
                      : "",
                  // masterId can be numeric string or 'r' prefixed string
                  masterId:
                    typeof lt.masterId === "string" && lt.masterId.trim()
                      ? lt.masterId.trim()
                      : typeof lt.masterId === "number" && lt.masterId > 0
                        ? String(lt.masterId)
                        : null,
                };
              })()
            : null,
      };
      profileCache.set(key, {
        ...normalizedProfile,
        highlights: cloneRecords(normalizedProfile.highlights),
        recentRecords: cloneRecords(normalizedProfile.recentRecords),
      });
      return normalizedProfile;
    } finally {
      if (!forceRefresh) {
        profileInFlight.delete(key);
      }
    }
  })();

  if (!forceRefresh) {
    profileInFlight.set(key, fetchPromise);
  }
  return fetchPromise;
}

const collectionCache = new Map<string, MrcRecord[]>();
const collectionInFlight = new Map<string, Promise<MrcRecord[]>>();

const followsCache = new Map<string, UserFollowLists>();
const followsInFlight = new Map<string, Promise<UserFollowLists>>();

export interface FollowCountsSummary {
  followersCount: number;
  followingCount: number;
}

export interface FollowActionResult {
  target: FollowCountsSummary;
  viewer: FollowCountsSummary;
  isFollowing: boolean;
}

function normalizeFollowCounts(raw: unknown): FollowCountsSummary {
  if (!raw || typeof raw !== "object") {
    return { followersCount: 0, followingCount: 0 };
  }
  const obj = raw as AnyObject;
  return {
    followersCount: normalizeCount(obj.followersCount),
    followingCount: normalizeCount(obj.followingCount),
  };
}

async function performFollowRequest(
  username: string,
  method: "POST" | "DELETE"
): Promise<FollowActionResult> {
  const trimmed = username.trim();
  if (!trimmed) {
    const error: ApiError = new Error("Username is required");
    error.status = 400;
    throw error;
  }

  const res = await fetch(apiUrl(`/api/community/users/${encodeURIComponent(trimmed)}/follow`), {
    method,
    credentials: "include",
  });

  if (!res.ok) {
    const message = await res
      .json()
      .catch(() => ({}))
      .then((data: AnyObject) => (typeof data?.error === 'string' ? data.error : "Failed to update follow status"));
    const error: ApiError = new Error(message);
    error.status = res.status;
    throw error;
  }

  const payload = (await res.json().catch(() => ({}))) as AnyObject;

  clearCommunityCaches();

  return {
  target: normalizeFollowCounts(payload?.target),
  viewer: normalizeFollowCounts(payload?.viewer),
    isFollowing: Boolean(payload?.isFollowing),
  };
}

export function followUser(username: string): Promise<FollowActionResult> {
  return performFollowRequest(username, "POST");
}

export function unfollowUser(username: string): Promise<FollowActionResult> {
  return performFollowRequest(username, "DELETE");
}

function cloneUserSummary(summary: CommunityUserSummary): CommunityUserSummary {
  return { ...summary };
}

function cloneFollowLists(lists: UserFollowLists): UserFollowLists {
  return {
    followers: lists.followers.map(cloneUserSummary),
    following: lists.following.map(cloneUserSummary),
  };
}

export async function loadPublicUserCollection(
  username: string,
  tableName?: string,
  forceRefresh = false
): Promise<MrcRecord[]> {
  const normalizedUser = username.trim().toLowerCase();
  if (!normalizedUser) {
    const error: ApiError = new Error("Username is required");
    error.status = 400;
    throw error;
  }
  const tableKey = tableName?.trim() || "";
  const cacheKey = `${normalizedUser}::${tableKey.toLowerCase()}`;
  if (!forceRefresh) {
    if (collectionCache.has(cacheKey)) {
      return cloneRecords(collectionCache.get(cacheKey)!);
    }
    if (collectionInFlight.has(cacheKey)) {
      return collectionInFlight.get(cacheKey)!;
    }
  }

  // Determine endpoint based on table name
  let endpoint = `/api/community/users/${username}/collection`;
  const normalizedTable = tableKey.toLowerCase();
  if (normalizedTable === "wishlist") {
    endpoint = `/api/community/users/${username}/wishlist`;
  } else if (normalizedTable === "listened") {
    endpoint = `/api/community/users/${username}/listened`;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(
        apiUrl(endpoint),
        { credentials: "include" }
      );
      if (!res.ok) {
        const message = await res
          .json()
          .catch(() => ({}))
          .then((data: AnyObject) => (typeof data?.error === 'string' ? data.error : "Failed to load collection"));
        const error: ApiError = new Error(message);
        error.status = res.status;
        throw error;
      }
      const data = await res.json().catch(() => []);
      const normalized = normalizeRecords(data);
      collectionCache.set(cacheKey, cloneRecords(normalized));
      return normalized;
    } finally {
      if (!forceRefresh) {
        collectionInFlight.delete(cacheKey);
      }
    }
  })();

  if (!forceRefresh) {
    collectionInFlight.set(cacheKey, fetchPromise);
  }
  return fetchPromise;
}

export async function loadPublicUserCollectionByGenre(
  username: string,
  genre: string,
  tableName?: string,
  forceRefresh = false
): Promise<MrcRecord[]> {
  const normalizedUser = username.trim().toLowerCase();
  if (!normalizedUser) {
    const error: ApiError = new Error("Username is required");
    error.status = 400;
    throw error;
  }
  
  const normalizedGenre = genre.trim();
  if (!normalizedGenre) {
    const error: ApiError = new Error("Genre is required");
    error.status = 400;
    throw error;
  }

  const cacheKey = `${normalizedUser}::genre::${normalizedGenre.toLowerCase()}${tableName ? `::${tableName}` : ''}`;
  if (!forceRefresh) {
    if (collectionCache.has(cacheKey)) {
      return cloneRecords(collectionCache.get(cacheKey)!);
    }
    if (collectionInFlight.has(cacheKey)) {
      return collectionInFlight.get(cacheKey)!;
    }
  }

  const params = new URLSearchParams();
  if (tableName) {
    params.set('t', tableName);
  }
  const queryString = params.toString();
  const endpoint = `/api/community/users/${username}/genre/${encodeURIComponent(normalizedGenre)}${queryString ? `?${queryString}` : ''}`;

  const fetchPromise = (async () => {
    try {
      const res = await fetch(
        apiUrl(endpoint),
        { credentials: "include" }
      );
      if (!res.ok) {
        const message = await res
          .json()
          .catch(() => ({}))
          .then((data: AnyObject) => (typeof data?.error === 'string' ? data.error : "Failed to load collection by genre"));
        const error: ApiError = new Error(message);
        error.status = res.status;
        throw error;
      }
      const data = await res.json().catch(() => []);
      const normalized = normalizeRecords(data);
      collectionCache.set(cacheKey, cloneRecords(normalized));
      return normalized;
    } finally {
      if (!forceRefresh) {
        collectionInFlight.delete(cacheKey);
      }
    }
  })();

  if (!forceRefresh) {
    collectionInFlight.set(cacheKey, fetchPromise);
  }
  return fetchPromise;
}

export async function loadUserFollows(username: string): Promise<UserFollowLists> {
  const normalizedUser = username.trim().toLowerCase();
  if (!normalizedUser) {
    const error: ApiError = new Error("Username is required");
    error.status = 400;
    throw error;
  }

  if (followsCache.has(normalizedUser)) {
    return cloneFollowLists(followsCache.get(normalizedUser)!);
  }

  if (followsInFlight.has(normalizedUser)) {
    return followsInFlight.get(normalizedUser)!;
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(
        apiUrl(`/api/community/users/${username}/follows`),
        {
          credentials: "include",
        }
      );
      if (!res.ok) {
        const message = await res
          .json()
          .catch(() => ({}))
          .then((data: AnyObject) => (typeof data?.error === 'string' ? data.error : "Failed to load follows"));
        const error: ApiError = new Error(message);
        error.status = res.status;
        throw error;
      }

      const data = (await res.json().catch(() => ({}))) as AnyObject;
      const followersRaw = Array.isArray(data.followers) ? data.followers : [];
      const followingRaw = Array.isArray(data.following) ? data.following : [];

      const follows: UserFollowLists = {
        followers: followersRaw
          .filter((item): item is AnyObject => isObject(item))
          .map((item) => normalizeUserSummary(item)),
        following: followingRaw
          .filter((item): item is AnyObject => isObject(item))
          .map((item) => normalizeUserSummary(item)),
      };

      followsCache.set(normalizedUser, cloneFollowLists(follows));
      return cloneFollowLists(follows);
    } finally {
      followsInFlight.delete(normalizedUser);
    }
  })();

  followsInFlight.set(normalizedUser, fetchPromise);
  return fetchPromise;
}

export async function loadUserFollowsPaginated(
  username: string,
  limit: number,
  followersOffset: number,
  followingOffset: number
): Promise<PaginatedUserFollowLists> {
  const normalizedUser = username.trim().toLowerCase();
  if (!normalizedUser) {
    const error: ApiError = new Error("Username is required");
    error.status = 400;
    throw error;
  }

  const params = new URLSearchParams();
  params.set("limit", limit.toString());
  params.set("followersOffset", followersOffset.toString());
  params.set("followingOffset", followingOffset.toString());

  const res = await fetch(
    apiUrl(`/api/community/users/${username}/follows?${params.toString()}`),
    {
      credentials: "include",
    }
  );

  if (!res.ok) {
    const message = await res
      .json()
      .catch(() => ({}))
      .then((data: AnyObject) =>
        typeof data?.error === "string" ? data.error : "Failed to load follows"
      );
    const error: ApiError = new Error(message);
    error.status = res.status;
    throw error;
  }

  const data = (await res.json().catch(() => ({}))) as AnyObject;
  const followersRaw = Array.isArray(data.followers) ? data.followers : [];
  const followingRaw = Array.isArray(data.following) ? data.following : [];

  return {
    followers: followersRaw
      .filter((item): item is AnyObject => isObject(item))
      .map((item) => normalizeUserSummary(item)),
    following: followingRaw
      .filter((item): item is AnyObject => isObject(item))
      .map((item) => normalizeUserSummary(item)),
    followersTotal: normalizeCount(data.followersTotal),
    followingTotal: normalizeCount(data.followingTotal),
    followersHasMore: Boolean(data.followersHasMore),
    followingHasMore: Boolean(data.followingHasMore),
  };
}

export function clearCommunityCaches(): void {
  searchCache.clear();
  searchInFlight.clear();
  profileCache.clear();
  profileInFlight.clear();
  collectionCache.clear();
  collectionInFlight.clear();
  followsCache.clear();
  followsInFlight.clear();
  activityFeedCache.clear();
  activityFeedInFlight.clear();
}
