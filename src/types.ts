export interface Record {
  id: number;
  cover?: string; // Optional cover art path
  record: string;
  artist: string;
  rating: number;
  tags: string[];
  release: number;
  dateAdded: string;
  tableId?: number;
  collectionName?: string | null;
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
  | "dateAdded";

export interface RecordTableSortPreference {
  field: Extract<RecordTableColumnKey, "record" | "artist" | "rating" | "release" | "dateAdded">;
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
  { key: "dateAdded", label: "Date Added", sortable: true, hideable: true },
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
    dateAdded: true,
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
}

export interface ProfileHighlights {
  recordIds: number[];
  records: Record[];
}