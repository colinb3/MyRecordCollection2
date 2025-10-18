export interface Record {
  id: number;
  cover?: string; // Optional cover art path
  record: string;
  artist: string;
  rating: number;
  isCustom: boolean;
  tags: string[];
  release: number;
  added: string;
  tableId?: number;
  tableName?: string | null;
  collectionName?: string | null;
  masterId?: number | null;
  review?: string | null;
}

export interface RecordOwnerInfo {
  username: string;
  displayName: string | null;
  profilePicUrl: string | null;
}

export interface RecordDetailResponse {
  record: Record;
  owner?: RecordOwnerInfo | null;
}

export interface Filters {
  tags: string[];
  rating: { min: number; max: number };
  release: { min: number; max: number };
}

export type RecordTableColumnKey =
  | "cover"
  | "record"
  | "artist"
  | "rating"
  | "tags"
  | "release"
  | "added";

export interface RecordTableSortPreference {
  field: Extract<RecordTableColumnKey, "record" | "artist" | "rating" | "release" | "added">;
  order: "asc" | "desc";
}

export interface RecordTablePreferences {
  columnVisibility: ColumnVisibilityMap;
  defaultSort: RecordTableSortPreference;
}

export interface RecordTableColumnDefinition {
  key: RecordTableColumnKey;
  label: string;
  sortable: boolean;
  hideable: boolean;
}

export const RECORD_TABLE_COLUMNS: RecordTableColumnDefinition[] = [
  { key: "cover", label: "Cover", sortable: false, hideable: true },
  { key: "record", label: "Record", sortable: true, hideable: false },
  { key: "artist", label: "Artist", sortable: true, hideable: true },
  { key: "rating", label: "Rating", sortable: true, hideable: true },
  { key: "tags", label: "Tags", sortable: false, hideable: true },
  { key: "release", label: "Release", sortable: true, hideable: true },
  { key: "added", label: "Added", sortable: true, hideable: true },
];

export const SORTABLE_RECORD_TABLE_COLUMNS = RECORD_TABLE_COLUMNS.filter(
  (col): col is RecordTableColumnDefinition & {
    key: RecordTableSortPreference["field"];
    sortable: true;
  } => col.sortable
);

export type ColumnVisibilityMap = {
  [K in RecordTableColumnKey]: boolean;
};

export function createDefaultColumnVisibility(): ColumnVisibilityMap {
  const visibility: ColumnVisibilityMap = {
    cover: true,
    record: true,
    artist: true,
    rating: true,
    tags: true,
    release: true,
    added: true,
  };
  return visibility;
}

export function createDefaultRecordTablePreferences(): RecordTablePreferences {
  return {
    columnVisibility: createDefaultColumnVisibility(),
    defaultSort: { field: "rating", order: "desc" },
  };
}

export interface UserInfo {
  username: string;
  displayName: string | null;
  userUuid: string;
  bio: string | null;
  profilePicUrl: string | null;
  followersCount: number;
  followingCount: number;
  joinedDate: string | null;
}

export interface ProfileHighlights {
  recordIds: number[];
  records: Record[];
}

export interface CommunityUserSummary {
  username: string;
  displayName: string | null;
  profilePicUrl: string | null;
  followersCount: number;
  followingCount: number;
}

export interface CommunityFeedOwner {
  username: string;
  displayName: string | null;
  profilePicUrl: string | null;
}

export interface CommunityFeedEntry {
  owner: CommunityFeedOwner;
  record: Record;
}

export interface PublicUserProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  profilePicUrl: string | null;
  highlights: Record[];
  recentRecords: Record[];
  wishlistRecords: Record[];
  listenedRecords: Record[];
  followersCount: number;
  followingCount: number;
  isFollowing: boolean | null;
  joinedDate: string | null;
  collectionPrivate: boolean;
  wishlistPrivate: boolean;
  listenedPrivate: boolean;
}

export interface UserFollowLists {
  followers: CommunityUserSummary[];
  following: CommunityUserSummary[];
}