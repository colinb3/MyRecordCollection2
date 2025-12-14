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
  masterId?: string | null;
  review?: string | null;
  reviewLikes?: number;
  viewerHasLikedReview?: boolean;
  // If present, indicates whether the collection this record belongs to is private
  collectionPrivate?: boolean;
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

export interface AdminPermissions {
  canManageAdmins: boolean;
  canDeleteUsers: boolean;
}

export interface UserInfo {
  username: string;
  email: string | null;
  displayName: string | null;
  userUuid: string;
  bio: string | null;
  profilePicUrl: string | null;
  followersCount: number;
  followingCount: number;
  joinedDate: string | null;
  isAdmin: boolean;
  adminPermissions: AdminPermissions;
  hasPendingReports: boolean;
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

export interface CommunityFeedListPreviewRecord {
  id: number;
  name: string;
  artist: string;
  cover: string | null;
}

export interface CommunityFeedRecordEntry {
  type: 'record';
  owner: CommunityFeedOwner;
  record: Record;
}

export interface CommunityFeedListEntry {
  type: 'list';
  owner: CommunityFeedOwner;
  list: {
    id: number;
    name: string;
    description: string | null;
    picture: string | null;
    recordCount: number;
    created: string;
    likes: number;
    likedByCurrentUser: boolean;
  };
  previewRecords: CommunityFeedListPreviewRecord[];
}

export interface CommunityFeedLikedReviewEntry {
  type: 'liked-review';
  liker: CommunityFeedOwner;
  reviewOwner: {
    username: string;
    displayName: string | null;
  };
  record: {
    id: number;
    name: string;
    artist: string;
  };
  likedAt: string;
}

export interface CommunityFeedLikedListEntry {
  type: 'liked-list';
  liker: CommunityFeedOwner;
  listOwner: {
    username: string;
    displayName: string | null;
  };
  list: {
    id: number;
    name: string;
  };
  likedAt: string;
}

export interface CommunityFeedListeningToEntry {
  type: 'listening-to';
  listener: CommunityFeedOwner;
  record: {
    masterId: string;
    name: string;
    artist: string;
    cover: string | null;
  };
  listeningAt: string;
}

export type CommunityFeedEntry =
  | CommunityFeedRecordEntry
  | CommunityFeedListEntry
  | CommunityFeedLikedReviewEntry
  | CommunityFeedLikedListEntry
  | CommunityFeedListeningToEntry;

export interface MasterReviewEntry {
  recordId: number;
  record: string;
  artist: string;
  cover?: string | null;
  rating: number | null;
  review: string;
  added: string;
  owner: CommunityFeedOwner;
  reviewLikes: number;
  likedByViewer: boolean;
  isFriend: boolean;
}

export interface PublicUserProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  profilePicUrl: string | null;
  highlights: Record[];
  recentRecords: Record[];
  collectionCount: number;
  wishlistCount: number;
  listenedCount: number;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean | null;
  joinedDate: string | null;
  collectionPrivate: boolean;
  wishlistPrivate: boolean;
  listenedPrivate: boolean;
  listeningTo: {
    artist: string | null;
    cover: string | null;
    name: string;
    masterId: string | null;
  } | null;
}

export interface UserFollowLists {
  followers: CommunityUserSummary[];
  following: CommunityUserSummary[];
}

export interface PaginatedUserFollowLists {
  followers: CommunityUserSummary[];
  following: CommunityUserSummary[];
  followersTotal: number;
  followingTotal: number;
  followersHasMore: boolean;
  followingHasMore: boolean;
}