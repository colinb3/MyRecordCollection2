import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.join(__dirname, "uploads");
const profileUploadsDir = path.join(uploadsRoot, "profile");
const listUploadsDir = path.join(uploadsRoot, "list");
const PROFILE_PIC_SIZE_LIMIT = Number(process.env.PROFILE_PIC_MAX_BYTES || 5 * 1024 * 1024);
const LIST_PIC_SIZE_LIMIT = PROFILE_PIC_SIZE_LIMIT;
const ALLOWED_PROFILE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://0.0.0.0:5173',
  credentials: true
}));
app.use(cookieParser());
app.use("/uploads", express.static(uploadsRoot));

const PORT = Number(process.env.PORT || 4000);
// bind to 0.0.0.0 so the server is reachable from other machines (GCE VM)
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET;
const DEFAULT_COLLECTION_NAME = "My Collection";
const WISHLIST_COLLECTION_NAME = "Wishlist";
const LISTENED_COLLECTION_NAME = "Listened";
const MAX_PROFILE_HIGHLIGHTS = 3;
const PROFILE_RECENT_PREVIEW_LIMIT = 3;
const PROFILE_WISHLIST_PREVIEW_LIMIT = 3;
const PROFILE_LISTENED_PREVIEW_LIMIT = 3;
const MASTER_REVIEW_LIMIT = 10;
const DISCOGS_API_URL = "https://api.discogs.com/database/search";
const DISCOGS_USER_AGENT = process.env.DISCOGS_USER_AGENT || "MyRecordCollection/1.0 (+https://myrecordcollection.app)";
const DISCOGS_API_KEY = process.env.DISCOGS_API_KEY || "";
const DISCOGS_API_SECRET = process.env.DISCOGS_API_SECRET || "";

const fsPromises = fs.promises;
const MIME_EXTENSION_MAP = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/avif", ".avif"],
]);

const profilePicStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fsPromises
      .mkdir(profileUploadsDir, { recursive: true })
      .then(() => cb(null, profileUploadsDir))
      .catch((err) => cb(err));
  },
  filename: (req, file, cb) => {
    const fallbackExt = path.extname(file.originalname) || ".jpg";
    const ext = MIME_EXTENSION_MAP.get(file.mimetype) || fallbackExt;
    const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
    const uniqueName = `${req.userUuid || uuidv4()}-${Date.now()}${safeExt}`;
    cb(null, uniqueName);
  },
});

function profilePicFileFilter(_req, file, cb) {
  if (!ALLOWED_PROFILE_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("Only image files (JPG, PNG, WEBP, AVIF) are allowed."));
  }
  cb(null, true);
}

const profilePicUpload = multer({
  storage: profilePicStorage,
  fileFilter: profilePicFileFilter,
  limits: { fileSize: PROFILE_PIC_SIZE_LIMIT },
});

const listPicStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fsPromises
      .mkdir(listUploadsDir, { recursive: true })
      .then(() => cb(null, listUploadsDir))
      .catch((err) => cb(err));
  },
  filename: (req, file, cb) => {
    const fallbackExt = path.extname(file.originalname) || ".jpg";
    const ext = MIME_EXTENSION_MAP.get(file.mimetype) || fallbackExt;
    const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
    const rawListId = typeof req.params?.listId === "string" ? req.params.listId : "list";
    const listIdFragment = rawListId.replace(/[^0-9A-Za-z_-]/g, "").slice(0, 24) || "list";
    const uniqueName = `${listIdFragment}-${Date.now()}-${uuidv4()}${safeExt}`;
    cb(null, uniqueName);
  },
});

const listPicUpload = multer({
  storage: listPicStorage,
  fileFilter: profilePicFileFilter,
  limits: { fileSize: LIST_PIC_SIZE_LIMIT },
});

function buildProfilePicRelativePath(filename) {
  return `profile/${filename}`;
}

function buildProfilePicPublicPath(relativePath) {
  if (!relativePath) return null;
  const normalized = relativePath.replace(/\\/g, "/");
  return `/uploads/${normalized}`;
}

async function deleteProfilePicFile(relativePath) {
  if (!relativePath) return;
  const absolutePath = path.join(uploadsRoot, relativePath);
  try {
    await fsPromises.unlink(absolutePath);
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      console.warn("Failed to delete previous profile picture", error);
    }
  }
}

function buildListPicRelativePath(filename) {
  return `list/${filename}`;
}

function buildListPicPublicPath(relativePath) {
  if (!relativePath) return null;
  const normalized = relativePath.replace(/\\/g, "/");
  return `/uploads/${normalized}`;
}

async function deleteListPicFile(relativePath) {
  if (!relativePath) return;
  const absolutePath = path.join(uploadsRoot, relativePath);
  try {
    await fsPromises.unlink(absolutePath);
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      console.warn("Failed to delete list picture", error);
    }
  }
}

function normalizeFollowCount(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.trunc(num);
}

function normalizeNonNegativeInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.trunc(num);
}

function normalizeDateOnly(value) {
  if (!value) return null;

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

function formatUtcDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(
    date.getUTCSeconds()
  )}`;
}

const RECORD_TABLE_COLUMN_KEYS = [
  "cover",
  "record",
  "artist",
  "rating",
  "tags",
  "release",
  "added",
];
const SORTABLE_RECORD_TABLE_COLUMN_KEYS = [
  "record",
  "artist",
  "rating",
  "release",
  "added",
];

function createDefaultRecordTablePreferences() {
  return {
    columnVisibility: {
      cover: true,
      record: true,
      artist: true,
      rating: true,
      tags: true,
      release: true,
      added: true,
    },
    defaultSort: { field: "rating", order: "desc" },
  };
}

function normalizeRecordTablePreferences(raw) {
  const defaults = createDefaultRecordTablePreferences();
  const normalized = {
    columnVisibility: { ...defaults.columnVisibility },
    defaultSort: { ...defaults.defaultSort },
  };

  if (raw && typeof raw === "object") {
    if (raw.columnVisibility && typeof raw.columnVisibility === "object") {
      for (const key of RECORD_TABLE_COLUMN_KEYS) {
        if (typeof raw.columnVisibility[key] === "boolean") {
          normalized.columnVisibility[key] = raw.columnVisibility[key];
        }
      }
    }

    const sort = raw.defaultSort;
    if (
      sort &&
      typeof sort === "object" &&
      typeof sort.field === "string" &&
      SORTABLE_RECORD_TABLE_COLUMN_KEYS.includes(sort.field) &&
      (sort.order === "asc" || sort.order === "desc")
    ) {
      normalized.defaultSort = { field: sort.field, order: sort.order };
    }
  }

  normalized.columnVisibility.record = true;

  return normalized;
}

function normalizeProfileHighlightIds(raw) {
  if (!raw) return [];
  let source = raw;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }

  if (!Array.isArray(source)) return [];

  const normalized = [];
  const seen = new Set();
  for (const value of source) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
    if (normalized.length >= MAX_PROFILE_HIGHLIGHTS) break;
  }
  return normalized;
}

async function getProfileHighlightIds(pool, userUuid) {
  const [rows] = await pool.execute(
    `SELECT profileHighlights FROM UserSettings WHERE userUuid = ? LIMIT 1`,
    [userUuid]
  );
  if (!rows || rows.length === 0) return [];
  return normalizeProfileHighlightIds(rows[0].profileHighlights);
}

async function fetchRecordsWithTagsByIds(pool, userUuid, recordIds) {
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
     return [];
  }

  const placeholders = recordIds.map(() => "?").join(", ");
  const params = [userUuid, ...recordIds];
    const [rows] = await pool.query(
    `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review, t.name as collectionName
       FROM Record r
       LEFT JOIN RecTable t ON r.tableId = t.id
       WHERE r.userUuid = ? AND r.id IN (${placeholders})`,
      params
    );

  if (!rows || rows.length === 0) return [];

  const foundIds = rows.map((row) => row.id);
  const tagsByRecord = {};
  const [tagRows] = await pool.query(
    `SELECT t.name, tg.recordId FROM Tag t JOIN Tagged tg ON t.id = tg.tagId WHERE tg.recordId IN (${foundIds
      .map(() => "?")
      .join(", ")})`,
    foundIds
  );
  for (const tr of tagRows) {
    const rid = tr.recordId;
    tagsByRecord[rid] = tagsByRecord[rid] || [];
    tagsByRecord[rid].push(tr.name);
  }

  const recordMap = new Map();
  for (const row of rows) {
    recordMap.set(row.id, {
      ...row,
      tags: tagsByRecord[row.id] || [],
    });
  }

  return recordIds
    .map((id) => recordMap.get(id))
    .filter((value) => value !== undefined);
}

async function getUserByUsername(pool, username) {
  const [rows] = await pool.execute(
    `SELECT u.uuid, u.username, u.displayName, u.bio, u.profilePic, u.created,
            (SELECT COUNT(*) FROM Follows WHERE followsUuid = u.uuid) AS followersCount,
            (SELECT COUNT(*) FROM Follows WHERE userUuid = u.uuid) AS followingCount
     FROM User u WHERE u.username = ? LIMIT 1`,
    [username]
  );
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

async function getFollowersForUser(pool, userUuid) {
  const [rows] = await pool.query(
    `SELECT follower.username, follower.displayName, follower.profilePic,
            (SELECT COUNT(*) FROM Follows WHERE followsUuid = follower.uuid) AS followersCount,
            (SELECT COUNT(*) FROM Follows WHERE userUuid = follower.uuid) AS followingCount
     FROM Follows f
     JOIN User follower ON f.userUuid = follower.uuid
     WHERE f.followsUuid = ?
     ORDER BY follower.username`,
    [userUuid]
  );
  return rows.map(mapCommunityUserSummary);
}

async function getFollowingForUser(pool, userUuid) {
  const [rows] = await pool.query(
    `SELECT following.username, following.displayName, following.profilePic,
            (SELECT COUNT(*) FROM Follows WHERE followsUuid = following.uuid) AS followersCount,
            (SELECT COUNT(*) FROM Follows WHERE userUuid = following.uuid) AS followingCount
     FROM Follows f
     JOIN User following ON f.followsUuid = following.uuid
     WHERE f.userUuid = ?
     ORDER BY following.username`,
    [userUuid]
  );
  return rows.map(mapCommunityUserSummary);
}

function normalizePublicUser(row) {
  if (!row) return null;
  const displayName =
    typeof row.displayName === "string" && row.displayName.trim()
      ? row.displayName.trim()
      : null;
  const bio =
    typeof row.bio === "string" && row.bio.trim().length > 0
      ? row.bio.trim()
      : null;
  const followersCount = normalizeFollowCount(row.followersCount);
  const followingCount = normalizeFollowCount(row.followingCount);
  const joinedDate = normalizeDateOnly(row.created);
  return {
    username: row.username,
    displayName,
    bio,
    profilePicUrl: buildProfilePicPublicPath(row.profilePic),
    followersCount,
    followingCount,
    joinedDate,
  };
}

function mapCommunityUserSummary(row) {
  const displayName =
    typeof row.displayName === "string" && row.displayName.trim()
      ? row.displayName.trim()
      : null;
  const followersCount = normalizeFollowCount(row.followersCount);
  const followingCount = normalizeFollowCount(row.followingCount);
  return {
    username: row.username,
    displayName,
    profilePicUrl: buildProfilePicPublicPath(row.profilePic),
    followersCount,
    followingCount,
  };
}

function mapListSummaryRow(row) {
  const id = Number(row?.id);
  return {
    id: Number.isInteger(id) && id > 0 ? id : 0,
    name: typeof row?.name === "string" ? row.name : "",
    description:
      typeof row?.description === "string" && row.description.trim()
        ? row.description.trim()
        : null,
    isPrivate: Number(row?.isPrivate) === 1,
    likes: normalizeNonNegativeInt(row?.likes),
    recordCount: normalizeNonNegativeInt(row?.recordCount),
    pictureUrl: buildListPicPublicPath(row?.picture ?? null),
    created: row?.created ? formatUtcDateTime(row.created) : null,
  };
}

function mapListSummaryWithOwner(row) {
  const base = mapListSummaryRow(row);
  const username = typeof row?.username === "string" ? row.username : null;
  return {
    ...base,
    owner: username
      ? {
          username,
          displayName:
            typeof row?.displayName === "string" && row.displayName.trim()
              ? row.displayName.trim()
              : null,
          profilePicUrl: buildProfilePicPublicPath(row?.profilePic ?? null),
        }
      : null,
    likedByCurrentUser: Number(row?.likedByCurrentUser) === 1,
  };
}

function mapListRecordRow(row) {
  const id = Number(row?.id);
  const ratingValue = Number(row?.rating);
  const releaseYearValue = Number(row?.releaseYear);
  const masterIdValue = Number(row?.masterId);
  const sortOrderValue = Number(row?.sortOrder);
  return {
    id: Number.isInteger(id) && id > 0 ? id : 0,
    name: typeof row?.name === "string" ? row.name : "",
    artist:
      typeof row?.artist === "string" && row.artist.trim()
        ? row.artist.trim()
        : null,
    cover:
      typeof row?.cover === "string" && row.cover.trim()
        ? row.cover.trim()
        : null,
    rating:
      Number.isFinite(ratingValue) && ratingValue >= 0 && ratingValue <= 10
        ? Math.trunc(ratingValue)
        : null,
    releaseYear: Number.isInteger(releaseYearValue) ? releaseYearValue : null,
    masterId: Number.isInteger(masterIdValue) && masterIdValue > 0 ? masterIdValue : null,
    added: row?.added ? formatUtcDateTime(row.added) : null,
    sortOrder: Number.isInteger(sortOrderValue) && sortOrderValue > 0 ? sortOrderValue : undefined,
  };
}

function escapeForLike(term) {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function getAdminPermissions(pool, userUuid) {
  if (!userUuid) {
    return null;
  }
  const [rows] = await pool.execute(
    "SELECT canManageAdmins, canDeleteUsers FROM Admin WHERE userUuid = ? LIMIT 1",
    [userUuid]
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const row = rows[0];
  return {
    canManageAdmins: Boolean(row.canManageAdmins),
    canDeleteUsers: Boolean(row.canDeleteUsers),
  };
}

async function countOtherAdmins(pool, excludedUuid) {
  if (!excludedUuid) {
    const [rows] = await pool.query("SELECT COUNT(*) AS total FROM Admin");
    return Number(rows?.[0]?.total) || 0;
  }
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM Admin WHERE userUuid <> ?",
    [excludedUuid]
  );
  return Number(rows?.[0]?.total) || 0;
}

async function countOtherManageAdmins(pool, excludedUuid) {
  if (!excludedUuid) {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS total FROM Admin WHERE canManageAdmins = TRUE"
    );
    return Number(rows?.[0]?.total) || 0;
  }
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM Admin WHERE userUuid <> ? AND canManageAdmins = TRUE",
    [excludedUuid]
  );
  return Number(rows?.[0]?.total) || 0;
}

async function fetchTagsByRecordIds(pool, recordIds) {
  const tagsByRecord = {};
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return tagsByRecord;
  }
  const placeholders = recordIds.map(() => "?").join(", ");
  const [tagRows] = await pool.query(
    `SELECT t.name, tg.recordId FROM Tag t JOIN Tagged tg ON t.id = tg.tagId WHERE tg.recordId IN (${placeholders})`,
    recordIds
  );
  for (const row of tagRows) {
    const recordId = row.recordId;
    if (!tagsByRecord[recordId]) {
      tagsByRecord[recordId] = [];
    }
    tagsByRecord[recordId].push(row.name);
  }
  return tagsByRecord;
}

function buildDiscogsSearchUrl(artist, record) {
  const url = new URL(DISCOGS_API_URL);
  url.searchParams.set("type", "master");
  url.searchParams.set("query", artist + " - " + record);
  url.searchParams.set("per_page", "5");
  if (DISCOGS_API_KEY && DISCOGS_API_SECRET) {
    url.searchParams.set("key", DISCOGS_API_KEY);
    url.searchParams.set("secret", DISCOGS_API_SECRET);
  }
  return url.toString();
}

function normalizeDiscogsReleaseYear(raw) {
  const year = Number(raw);
  if (Number.isInteger(year) && year >= 1901 && year <= 2100) {
    return year;
  }
  return null;
}

function buildDiscogsBarcodeSearchUrl(barcode) {
  const url = new URL(DISCOGS_API_URL);
  url.searchParams.set("type", "release");
  url.searchParams.set("barcode", barcode);
  url.searchParams.set("per_page", "5");
  if (DISCOGS_API_KEY && DISCOGS_API_SECRET) {
    url.searchParams.set("key", DISCOGS_API_KEY);
    url.searchParams.set("secret", DISCOGS_API_SECRET);
  }
  return url.toString();
}

function splitDiscogsTitle(title) {
  const value = typeof title === "string" ? title.trim() : "";
  if (!value) {
    return { artist: null, record: null };
  }

  const separators = [" - ", " – "];
  for (const separator of separators) {
    const index = value.indexOf(separator);
    if (index > 0) {
      const artist = value.slice(0, index).trim();
      const record = value.slice(index + separator.length).trim();
      return {
        artist: artist || null,
        record: record || null,
      };
    }
  }

  return {
    artist: null,
    record: value || null,
  };
}

/**
 * Normalizes a string for comparison by removing punctuation, whitespace, and converting to lowercase.
 * @param {string} str - The string to normalize
 * @returns {string} The normalized string
 */
function normalizeForComparison(str) {
  if (typeof str !== "string") {
    return "";
  }
  // Remove all punctuation and whitespace, convert to lowercase
  return str.toLowerCase().replace(/[\s\p{P}]/gu, "");
}

/**
 * Checks if a Discogs result matches the expected artist and record name.
 * @param {object} discogsResult - The result object from Discogs
 * @param {string} expectedArtist - The artist we're searching for
 * @param {string} expectedRecord - The record name we're searching for
 * @returns {boolean} True if the result matches the expected artist and record
 */
function doesDiscogsResultMatch(discogsResult, expectedArtist, expectedRecord) {
  if (!discogsResult?.title) {
    return false;
  }

  const { artist, record } = splitDiscogsTitle(discogsResult.title);
  if (!artist || !record) {
    return false;
  }

  // Remove trailing (digit) from artist name, as seen in barcode lookup
  const cleanedArtist = artist.replace(/\s*\(\d+\)\s*$/, "").trim();

  const normalizedDiscogsArtist = normalizeForComparison(cleanedArtist);
  const normalizedDiscogsRecord = normalizeForComparison(record);
  const normalizedExpectedArtist = normalizeForComparison(expectedArtist);
  const normalizedExpectedRecord = normalizeForComparison(expectedRecord);

  return (
    normalizedDiscogsArtist === normalizedExpectedArtist &&
    normalizedDiscogsRecord === normalizedExpectedRecord
  );
}

/**
 * Normalizes a barcode to alphanumeric characters only for comparison.
 * @param {string} barcode - The barcode to normalize
 * @returns {string} The normalized barcode with only alphanumeric characters
 */
function normalizeBarcode(barcode) {
  if (typeof barcode !== "string") {
    return "";
  }
  return barcode.replace(/[^0-9A-Za-z]/g, "").toLowerCase();
}

/**
 * Checks if a Discogs result contains the searched barcode.
 * @param {object} discogsResult - The result object from Discogs
 * @param {string} searchedBarcode - The barcode that was searched for
 * @returns {boolean} True if the result contains a matching barcode
 */
function doesDiscogsResultContainBarcode(discogsResult, searchedBarcode) {
  const normalizedSearch = normalizeBarcode(searchedBarcode);
  if (!normalizedSearch) {
    return false;
  }

  const barcodes = discogsResult?.barcode;
  if (!Array.isArray(barcodes) || barcodes.length === 0) {
    return false;
  }

  return barcodes.some((barcode) => {
    const normalizedBarcode = normalizeBarcode(barcode);
    return normalizedBarcode === normalizedSearch;
  });
}

async function lookupDiscogsByBarcode(barcode) {
  const trimmed = typeof barcode === "string" ? barcode.trim() : "";
  if (!trimmed) {
    return null;
  }

  const requestUrl = buildDiscogsBarcodeSearchUrl(trimmed);

  try {
    const response = await fetch(requestUrl, {
      headers: {
        "User-Agent": DISCOGS_USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const status = response.status;
      const text = await response.text().catch(() => "");
      throw new Error(`Discogs barcode request failed (${status}): ${text}`);
    }

    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) {
      return null;
    }

    const prioritized =
      results.find((item) => Number(item?.master_id) > 0) ?? results[0];
    if (!prioritized) {
      return null;
    }

    // Verify that the result actually contains the searched barcode
    if (!doesDiscogsResultContainBarcode(prioritized, trimmed)) {
      console.log(
        `Discogs result does not contain searched barcode: ${trimmed}`
      );
      return null;
    }

    const { artist, record } = splitDiscogsTitle(prioritized?.title);
    const masterIdRaw = prioritized?.master_id;
    const masterId = Number(masterIdRaw);
    const releaseYear = normalizeDiscogsReleaseYear(prioritized?.year);
    const cover =
      typeof prioritized?.cover_image === "string" && prioritized.cover_image.trim()
        ? prioritized.cover_image.trim()
        : typeof prioritized?.thumb === "string" && prioritized.thumb.trim()
        ? prioritized.thumb.trim()
        : null;

    // Remove trailing (digit) from artist name
    const cleanedArtist = artist
      ? artist.replace(/\s*\(\d+\)\s*$/, "").trim()
      : null;

    return {
      masterId: Number.isInteger(masterId) && masterId > 0 ? masterId : null,
      artist: cleanedArtist || null,
      record: record || null,
      releaseYear,
      discogsCover: cover,
    };
  } catch (error) {
    console.warn("Discogs barcode lookup failed", error);
    throw error;
  }
}

async function lookupDiscogsMaster(artist, record) {
  const trimmedArtist = typeof artist === "string" ? artist.trim() : "";
  const trimmedRecord = typeof record === "string" ? record.trim() : "";
  if (!trimmedArtist || !trimmedRecord) {
    return null;
  }

  const requestUrl = buildDiscogsSearchUrl(trimmedArtist, trimmedRecord);

  try {
    const response = await fetch(requestUrl, {
      headers: {
        "User-Agent": DISCOGS_USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const status = response.status;
      const text = await response.text().catch(() => "");
      throw new Error(`Discogs request failed (${status}): ${text}`);
    }

    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) {
      return null;
    }

    // Try to find a result that matches the artist and record name
    let matchingResult = results.find((result) =>
      doesDiscogsResultMatch(result, trimmedArtist, trimmedRecord)
    );

    // If no exact match found, use the first result as fallback
    if (!matchingResult) {
      console.log(
        `No exact match found for "${trimmedArtist}" - "${trimmedRecord}", using first result`
      );
      matchingResult = results[0];
    }

    // Prioritize results with master_id, similar to barcode lookup
    const masterIdRaw = matchingResult?.master_id ?? matchingResult?.id;
    const masterId = Number(masterIdRaw);
    const releaseYear = normalizeDiscogsReleaseYear(matchingResult?.year);
    const cover =
      typeof matchingResult?.cover_image === "string" && matchingResult.cover_image.trim()
        ? matchingResult.cover_image.trim()
        : typeof matchingResult?.thumb === "string" && matchingResult.thumb.trim()
        ? matchingResult.thumb.trim()
        : null;

    return {
      masterId: Number.isInteger(masterId) && masterId > 0 ? masterId : null,
      releaseYear,
      cover,
    };
  } catch (error) {
    console.warn("Discogs lookup failed", error);
    throw error;
  }
}

async function getUserFollowCounts(pool, userUuid) {
  const [rows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM Follows WHERE followsUuid = ?) AS followersCount,
       (SELECT COUNT(*) FROM Follows WHERE userUuid = ?) AS followingCount`,
    [userUuid, userUuid]
  );
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
  return {
    followersCount: normalizeFollowCount(row.followersCount),
    followingCount: normalizeFollowCount(row.followingCount),
  };
}

// In production we require a JWT secret
if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
  console.error('Missing JWT_SECRET in production environment. Set JWT_SECRET and restart.');
  process.exit(1);
}

// Helper to issue JWT
function issueToken(userUuid) {
  return jwt.sign({ userUuid }, JWT_SECRET);
}

// Create a single shared pool (previously a new pool was created per request causing 'Too many connections')
let _pool; // singleton reference
function getPool() {
  if (!_pool) {
    _pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
      queueLimit: 0,
    });
    console.log("MySQL pool created");
  }
  return _pool;
}

function extractUserUuidFromRequest(req) {
  const token = req.cookies?.token;
  if (!token) {
    return null;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload && typeof payload.userUuid === "string") {
      return payload.userUuid;
    }
  } catch {
    return null;
  }
  return null;
}

async function getUserTableRow(pool, userUuid, tableName) {
  if (!tableName) return null;
  const [rows] = await pool.execute(
    `SELECT id, name, isPrivate FROM RecTable WHERE userUuid = ? AND name = ? LIMIT 1`,
    [userUuid, tableName]
  );
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

async function getUserTableId(pool, userUuid, tableName) {
  const row = await getUserTableRow(pool, userUuid, tableName);
  return row ? row.id : null;
}

async function getUserCollectionsForRecord(pool, userUuid, { masterId, artist, recordName }) {
  if (!userUuid) {
    return [];
  }

  const normalizedArtist = typeof artist === "string" ? artist.trim() : "";
  const normalizedRecord = typeof recordName === "string" ? recordName.trim() : "";

  const results = [];
  const seen = new Set();

  if (Number.isInteger(masterId) && masterId > 0) {
    const [rows] = await pool.query(
      `SELECT r.id AS recordId, rt.name AS tableName
         FROM Record r
         JOIN RecTable rt ON r.tableId = rt.id
        WHERE r.userUuid = ? AND r.masterId = ?`,
      [userUuid, masterId]
    );
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const recordIdNumber = Number(row?.recordId);
        const tableName = typeof row?.tableName === "string" ? row.tableName : null;
        if (!tableName || !Number.isInteger(recordIdNumber) || recordIdNumber <= 0) {
          continue;
        }
        if (seen.has(recordIdNumber)) {
          continue;
        }
        seen.add(recordIdNumber);
        results.push({ tableName, recordId: recordIdNumber });
      }
    }
  }

  if (
    results.length === 0 &&
    normalizedArtist &&
    normalizedRecord
  ) {
    const [rows] = await pool.query(
      `SELECT r.id AS recordId, rt.name AS tableName
         FROM Record r
         JOIN RecTable rt ON r.tableId = rt.id
        WHERE r.userUuid = ?
          AND r.masterId IS NULL
          AND r.artist = ?
          AND r.name = ?`,
      [userUuid, normalizedArtist, normalizedRecord]
    );
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const recordIdNumber = Number(row?.recordId);
        const tableName = typeof row?.tableName === "string" ? row.tableName : null;
        if (!tableName || !Number.isInteger(recordIdNumber) || recordIdNumber <= 0) {
          continue;
        }
        if (seen.has(recordIdNumber)) {
          continue;
        }
        seen.add(recordIdNumber);
        results.push({ tableName, recordId: recordIdNumber });
      }
    }
  }

  return results;
}

async function getUserListsSummary(pool, userUuid) {
  if (!userUuid) {
    return [];
  }
  const [rows] = await pool.query(
    `SELECT id, name, isPrivate FROM List WHERE userUuid = ? ORDER BY name`,
    [userUuid]
  );
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows;
}

async function getUserListMembershipForRecord(pool, userUuid, { masterId, artist, recordName }) {
  if (!userUuid) {
    return new Map();
  }

  const normalizedArtist = typeof artist === "string" ? artist.trim() : "";
  const normalizedRecord = typeof recordName === "string" ? recordName.trim() : "";

  const params = [userUuid];
  let whereClause = "";
  if (Number.isInteger(masterId) && masterId > 0) {
    whereClause = "lr.masterId = ?";
    params.push(masterId);
  } else if (normalizedArtist && normalizedRecord) {
    whereClause = "lr.masterId IS NULL AND lr.artist = ? AND lr.name = ?";
    params.push(normalizedArtist, normalizedRecord);
  } else {
    return new Map();
  }

  const [rows] = await pool.query(
    `SELECT lr.listId, lr.id AS listRecordId
       FROM ListRecord lr
       JOIN List l ON l.id = lr.listId
      WHERE l.userUuid = ? AND ${whereClause}`,
    params
  );

  const membership = new Map();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const listId = Number(row?.listId);
      const listRecordId = Number(row?.listRecordId);
      if (Number.isInteger(listId) && Number.isInteger(listRecordId)) {
        membership.set(listId, listRecordId);
      }
    }
  }

  return membership;
}

async function getUserListsForRecord(pool, userUuid, info) {
  const summaries = await getUserListsSummary(pool, userUuid);
  if (summaries.length === 0) {
    return [];
  }
  const membership = await getUserListMembershipForRecord(pool, userUuid, info);
  return summaries.map((row) => {
    const listId = Number(row?.id);
    const isPrivate = Number(row?.isPrivate) === 1;
    return {
      listId,
      name: typeof row?.name === "string" ? row.name : "",
      isPrivate,
      listRecordId: membership.get(listId) ?? null,
    };
  });
}

async function getListById(pool, listId) {
  if (!Number.isInteger(listId) || listId <= 0) {
    return null;
  }
  const [rows] = await pool.query(
    `SELECT l.id, l.name, l.description, l.isPrivate, l.likes, l.picture, l.created, l.userUuid,
            u.username, u.displayName, u.profilePic
       FROM List l
       JOIN User u ON u.uuid = l.userUuid
      WHERE l.id = ?
      LIMIT 1`,
    [listId]
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  return rows[0];
}

async function getOwnedListById(pool, listId, userUuid) {
  if (!Number.isInteger(listId) || listId <= 0 || !userUuid) {
    return null;
  }
  const [rows] = await pool.query(
    `SELECT id, name, description, isPrivate, likes, picture, created, userUuid
       FROM List
      WHERE id = ? AND userUuid = ?
      LIMIT 1`,
    [listId, userUuid]
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  return rows[0];
}

async function fetchLastFmCover(artist, record) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return null;
  const query = `${record}`.trim(); // search by record title only per request
  if (!query) return null;
  const url = `https://ws.audioscrobbler.com/2.0/?method=album.search&album=${encodeURIComponent(
    query
  )}&api_key=${apiKey}&format=json&limit=5`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const albums = data?.results?.albummatches?.album;
    if (!Array.isArray(albums) || albums.length === 0) return null;

    // normalize target artist for comparison
    const targetArtist = (artist || "").toLowerCase().trim();

    // helper to extract extralarge (or best fallback) from album image array
    const pickExtralarge = (album) => {
      const images = Array.isArray(album?.image) ? album.image : [];
      // find extralarge first
      const extral = images.find((img) => img && img.size === 'extralarge' && img['#text']);
      if (extral && extral['#text']) return extral['#text'];
      // fallback to largest available (prefer mega, then large, then medium, then small)
      const order = ['extralarge', 'large', 'medium', 'small'];
      for (const sz of order) {
        const found = images.find((img) => img && img.size === sz && img['#text']);
        if (found && found['#text']) return found['#text'];
      }
      return null;
    };

    // Try to find an album where the artist attribute matches (case-insensitive)
    if (targetArtist) {
      for (const album of albums) {
        const aArtist = (album?.artist || "").toLowerCase().trim();
        if (aArtist && aArtist === targetArtist) {
          const urlText = pickExtralarge(album);
          if (urlText) return urlText;
        }
      }
    }

    // No exact artist match found — use the first album's cover (prefer extralarge)
    const firstCover = pickExtralarge(albums[0]);
    return firstCover || null;
  } catch (err) {
    console.warn('Last.fm cover lookup failed', err);
    return null;
  }
}

// Graceful shutdown to release pool connections
async function shutdown() {
  if (_pool) {
    try {
      console.log("Closing MySQL pool...");
      await _pool.end();
      console.log("MySQL pool closed");
    } catch (e) {
      console.error("Error closing MySQL pool", e);
    }
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// JWT auth middleware
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userUuid = payload.userUuid;
    req.isAdmin = undefined;
    req.adminPermissions = undefined;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

async function requireAdmin(req, res, next) {
  if (req.isAdmin === true && req.adminPermissions) {
    return next();
  }
  try {
    const pool = await getPool();
    const permissions = await getAdminPermissions(pool, req.userUuid);
    if (!permissions) {
      return res.status(403).json({ error: "Admin privileges required" });
    }
    req.isAdmin = true;
    req.adminPermissions = permissions;
    next();
  } catch (error) {
    console.error("Failed to verify admin privileges", error);
    res.status(500).json({ error: "Failed to verify admin privileges" });
  }
}

app.get("/api/records", requireAuth, async (req, res) => {
  const tableName = typeof req.query.table === "string" ? req.query.table : null;
  console.log("Fetching record table:", tableName);
  if (!tableName) {
    return res.status(400).json({ error: "table query parameter required" });
  }
  try {
    const pool = await getPool();
      const tableRow = await getUserTableRow(pool, req.userUuid, tableName);
      if (!tableRow) {
        return res.status(404).json({ error: "Collection not found" });
      }
      const tableId = tableRow.id;

   const [rows] = await pool.query(
   `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review
     FROM Record r WHERE r.userUuid = ? AND r.tableId = ?`,
      [req.userUuid, tableId]
    );

    const recordIds = rows.map((r) => r.id);
    const tagsByRecord = {};
    if (recordIds.length > 0) {
      const placeholders = recordIds.map(() => "?").join(", ");
      const [tagRows] = await pool.query(
        `SELECT t.name, tg.recordId FROM Tag t JOIN Tagged tg ON t.id = tg.tagId WHERE tg.recordId IN (${placeholders})`,
        recordIds
      );
      for (const tr of tagRows) {
        const rid = tr.recordId;
        tagsByRecord[rid] = tagsByRecord[rid] || [];
        tagsByRecord[rid].push(tr.name);
      }
    }

    const out = rows.map((r) => ({
      ...r,
      tableId: r.tableId,
      tags: tagsByRecord[r.id] || [],
    }));
    // Include privacy info for the requested collection so frontend doesn't need a separate call
    const privacy = {
      tableName: tableRow.name,
      isPrivate: Number(tableRow.isPrivate) === 1,
    };
    res.json({ records: out, privacy });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/records/master-info", async (req, res) => {
  console.log("Fetching master info...");

  let authenticatedUserUuid = null;
  const token = req.cookies?.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload && typeof payload.userUuid === "string") {
        authenticatedUserUuid = payload.userUuid;
      }
    } catch {
      // ignore invalid tokens for this optional check
    }
  }

  const masterIdParam = Number(req.query.masterId);
  const hasMasterId = Number.isInteger(masterIdParam) && masterIdParam > 0;

  if (hasMasterId) {
    try {
      const pool = await getPool();
      const [rows] = await pool.query(
        `SELECT id, name, artist, cover, release_year, ratingAve,
                rating1, rating2, rating3, rating4, rating5,
                rating6, rating7, rating8, rating9, rating10
           FROM Master
           WHERE id = ?
           LIMIT 1`,
        [masterIdParam]
      );
      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      const recordArtist = row?.artist ?? null;
      const recordName = row?.name ?? null;
      const userCollections = await getUserCollectionsForRecord(pool, authenticatedUserUuid, {
        masterId: masterIdParam,
        artist: recordArtist,
        recordName,
      });
      const userLists = await getUserListsForRecord(pool, authenticatedUserUuid, {
        masterId: masterIdParam,
        artist: recordArtist,
        recordName,
      });

      if (!row) {
        // Master ID exists but not in our database yet - fetch details from Discogs (barcode search)
        try {
          const discogsUrl = `https://api.discogs.com/masters/${masterIdParam}`;
          const discogsResponse = await fetch(discogsUrl, {
            headers: {
              "User-Agent": DISCOGS_USER_AGENT,
              Accept: "application/json",
            },
          });
          
          if (discogsResponse.ok) {
            const discogsData = await discogsResponse.json();
            const releaseYear = normalizeDiscogsReleaseYear(discogsData?.year);
            const cover = 
              typeof discogsData?.images?.[0]?.uri === "string" && discogsData.images[0].uri.trim()
                ? discogsData.images[0].uri.trim()
                : null;
            const artist = typeof discogsData?.artists?.[0]?.name === "string" ? discogsData.artists[0].name : null;
            const name = typeof discogsData?.title === "string" ? discogsData.title : null;
            
            return res.json({
              masterId: masterIdParam,
              releaseYear,
              ratingAverage: null,
              cover,
              ratingCounts: null,
              record: name,
              artist: artist,
              userCollections,
              userLists,
              inDb: false,
            });
          }
        } catch (discogsError) {
          // Fallback if Discogs fetch fails
        }
        
        return res.json({
          masterId: masterIdParam,
          releaseYear: null,
          ratingAverage: null,
          cover: null,
          ratingCounts: null,
          record: null,
          artist: null,
          userCollections,
          userLists,
          inDb: false,
        });
      }

      const ratingAverageRaw = row.ratingAve;
      const ratingAverage = ratingAverageRaw != null ? Number(ratingAverageRaw) : null;
      const releaseYearValue = row.release_year != null ? Number(row.release_year) : null;
      const coverValue =
        typeof row.cover === "string" && row.cover.trim() ? row.cover.trim() : null;
      const ratingCounts = Array.from({ length: 10 }, (_unused, index) => {
        const value = row[`rating${index + 1}`];
        const num = Number(value);
        return Number.isFinite(num) && num >= 0 ? num : 0;
      });

      return res.json({
        masterId: row.id,
        releaseYear: Number.isInteger(releaseYearValue) ? releaseYearValue : null,
        ratingAverage: Number.isFinite(ratingAverage) ? ratingAverage : null,
        cover: coverValue,
        ratingCounts,
        record: typeof row.name === "string" ? row.name : null,
        artist: typeof row.artist === "string" ? row.artist : null,
        userCollections,
        userLists,
        inDb: true,
      });
    } catch (error) {
      console.error("Failed to load master info", error);
      return res.status(502).json({ error: "Failed to fetch master information" });
    }
  }

  const artist = typeof req.query.artist === "string" ? req.query.artist.trim() : "";
  const recordName = typeof req.query.record === "string" ? req.query.record.trim() : "";

  if (!artist || !recordName) {
    return res.status(400).json({ error: "artist and record are required" });
  }

  try {
    const result = await lookupDiscogsMaster(artist, recordName);
    console.log("Fetching discogs result");

    const pool = await getPool();

    if (!result) {
      const userCollections = await getUserCollectionsForRecord(pool, authenticatedUserUuid, {
        masterId: null,
        artist,
        recordName,
      });
      const userLists = await getUserListsForRecord(pool, authenticatedUserUuid, {
        masterId: null,
        artist,
        recordName,
      });
      return res.json({
        masterId: null,
        releaseYear: null,
        ratingAverage: null,
        cover: null,
        ratingCounts: null,
        record: recordName,
        artist,
        userCollections,
        userLists,
        inDb: false,
      });
    }

    const [rows] = await pool.query(
      `SELECT ratingAve, rating1, rating2, rating3, rating4, rating5, rating6, rating7, rating8, rating9, rating10, release_year
         FROM Master
         WHERE id = ?
         LIMIT 1`,
      [result.masterId]
    );
    const ratingAveRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    const ratingAverageRaw = ratingAveRow ? ratingAveRow.ratingAve : null;
    const ratingAverage = ratingAverageRaw != null ? Number(ratingAverageRaw) : null;
    
    // Prioritize database release year over Discogs release year
    const dbReleaseYear = ratingAveRow?.release_year != null ? Number(ratingAveRow.release_year) : null;
    const finalReleaseYear = Number.isInteger(dbReleaseYear) ? dbReleaseYear : result.releaseYear;
    
    const ratingCounts = ratingAveRow
      ? Array.from({ length: 10 }, (_unused, index) => {
          const value = ratingAveRow[`rating${index + 1}`];
          const num = Number(value);
          return Number.isFinite(num) && num >= 0 ? num : 0;
        })
      : null;

    const userCollections = await getUserCollectionsForRecord(pool, authenticatedUserUuid, {
      masterId: result.masterId,
      artist,
      recordName,
    });
    const userLists = await getUserListsForRecord(pool, authenticatedUserUuid, {
      masterId: result.masterId,
      artist,
      recordName,
    });

    res.json({
      masterId: result.masterId,
      releaseYear: finalReleaseYear,
      ratingAverage: Number.isFinite(ratingAverage) ? ratingAverage : null,
      cover: result.cover,
      ratingCounts,
      record: recordName,
      artist,
      userCollections,
      userLists,
      inDb: !!ratingAveRow,
    });
  } catch (error) {
    console.error("Failed to load master info", error);
    res.status(502).json({ error: "Failed to fetch master information" });
  }
});

app.post("/api/barcode_search", async (req, res) => {
  console.log("Performing barcode search...");
  const rawBarcode =
    typeof req.body?.barcode === "string" ? req.body.barcode.trim() : "";

  if (!rawBarcode) {
    return res.status(400).json({ error: "barcode is required" });
  }

  const normalizedCandidates = Array.from(
    new Set(
      [rawBarcode, rawBarcode.replace(/[^0-9A-Za-z]/g, "")].filter(
        (value) => value && value.length > 0
      )
    )
  );

  let lookupResult = null;
  for (const candidate of normalizedCandidates) {
    try {
      lookupResult = await lookupDiscogsByBarcode(candidate);
      if (lookupResult) {
        break;
      }
    } catch (error) {
      console.warn("Barcode lookup attempt failed", error);
    }
  }

  if (!lookupResult) {
    return res.status(404).json({ error: "No results found for that barcode" });
  }

  try {
    const pool = await getPool();

    if (lookupResult.masterId) {
      const [existingRows] = await pool.query(
        `SELECT 1 FROM Master WHERE id = ? LIMIT 1`,
        [lookupResult.masterId]
      );
      if (Array.isArray(existingRows) && existingRows.length > 0) {
        return res.json({
          status: "existing",
          masterId: lookupResult.masterId,
        });
      }
    }

    const artist =
      typeof lookupResult.artist === "string" && lookupResult.artist.trim()
        ? lookupResult.artist.trim()
        : null;
    const record =
      typeof lookupResult.record === "string" && lookupResult.record.trim()
        ? lookupResult.record.trim()
        : null;

    let cover = null;
    if (artist && record) {
      cover = await fetchLastFmCover(artist, record);
    }
    if (!cover && lookupResult.discogsCover) {
      cover = lookupResult.discogsCover;
    }

    return res.json({
      status: "new",
      masterId: lookupResult.masterId,
      artist,
      record,
      cover: cover ?? null,
      releaseYear: lookupResult.releaseYear ?? null,
    });
  } catch (error) {
    console.error("Failed to complete barcode search", error);
    return res.status(502).json({ error: "Failed to process barcode search" });
  }
});

app.get("/api/records/master-reviews", async (req, res) => {
  console.log("Fetching master reviews...");

  const masterIdParam = Number(req.query.masterId);
  const masterId = Number.isInteger(masterIdParam) && masterIdParam > 0 ? masterIdParam : null;
  if (!masterId) {
    return res.status(400).json({ error: "masterId is required" });
  }

  let viewerUuid = null;
  const sortParamRaw = typeof req.query.sort === "string" ? req.query.sort.toLowerCase() : "date";
  const allowedSorts = new Set(["date", "likes", "friends"]);
  const sortOption = allowedSorts.has(sortParamRaw) ? sortParamRaw : "date";

  const token = req.cookies?.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      viewerUuid = payload.userUuid ?? null;
    } catch {
      viewerUuid = null;
    }
  }

  try {
    const pool = await getPool();

    const selectExtras = viewerUuid
      ? `, CASE WHEN f.userUuid IS NULL THEN 0 ELSE 1 END AS isFriend,
         CASE WHEN lr.userUuid IS NULL THEN 0 ELSE 1 END AS likedByViewer`
      : `, 0 AS isFriend, 0 AS likedByViewer`;

    const joinExtras = viewerUuid
      ? ` LEFT JOIN Follows f ON f.userUuid = ? AND f.followsUuid = u.uuid
          LEFT JOIN LikedReview lr ON lr.userUuid = ? AND lr.recordId = r.id`
      : ``;

    let orderClause = "ORDER BY r.added DESC, r.id DESC";
    if (sortOption === "likes") {
      orderClause = "ORDER BY r.reviewLikes DESC, r.added DESC, r.id DESC";
    } else if (sortOption === "friends" && viewerUuid) {
      orderClause = "ORDER BY isFriend DESC, r.added DESC, r.id DESC";
    }

    const params = [];
    if (viewerUuid) {
      params.push(viewerUuid, viewerUuid);
    }
    params.push(masterId, MASTER_REVIEW_LIMIT);

    const [rows] = await pool.query(
      `SELECT r.id, r.name AS record, r.artist, r.cover, r.rating, r.added, r.review, r.reviewLikes,
              u.username, u.displayName, u.profilePic
              ${selectExtras}
         FROM Record r
         JOIN User u ON u.uuid = r.userUuid
         LEFT JOIN RecTable t ON t.id = r.tableId
         ${joinExtras}
        WHERE r.masterId = ?
          AND r.review IS NOT NULL
          AND TRIM(r.review) <> ''
          AND (t.isPrivate = 0 OR t.isPrivate IS NULL)
        ${orderClause}
        LIMIT ?`,
      params
    );

    const reviews = Array.isArray(rows)
      ? rows
          .map((row) => {
            const reviewText =
              typeof row.review === "string" ? row.review.trim() : "";
            if (!reviewText) return null;

            const ratingValue = Number(row.rating);
            const rating =
              Number.isFinite(ratingValue) && ratingValue > 0 ? ratingValue : null;
            const addedValue =
              formatUtcDateTime(row.added) ?? formatUtcDateTime(new Date());
            const coverValue =
              typeof row.cover === "string" && row.cover.trim()
                ? row.cover.trim()
                : null;
            const displayName =
              typeof row.displayName === "string" && row.displayName.trim()
                ? row.displayName.trim()
                : null;
            const username =
              typeof row.username === "string" && row.username.trim()
                ? row.username.trim()
                : "";
            const reviewLikesValue = Number(row.reviewLikes);

            return {
              recordId: Number(row.id) || 0,
              record:
                typeof row.record === "string" && row.record.trim()
                  ? row.record.trim()
                  : "",
              artist:
                typeof row.artist === "string" && row.artist.trim()
                  ? row.artist.trim()
                  : "",
              cover: coverValue,
              rating,
              review: reviewText,
              added: addedValue,
              reviewLikes: Number.isFinite(reviewLikesValue)
                ? reviewLikesValue
                : 0,
              likedByViewer: Boolean(row.likedByViewer),
              isFriend: Boolean(row.isFriend),
              owner: {
                username,
                displayName,
                profilePicUrl: buildProfilePicPublicPath(row.profilePic),
              },
            };
          })
          .filter((entry) => entry !== null)
      : [];

    let ratingAverage = null;
    let masterRecord = null;
    let masterArtist = null;
    let masterCover = null;
    try {
      const [masterRows] = await pool.query(
        `SELECT name, artist, cover, ratingAve FROM Master WHERE id = ? LIMIT 1`,
        [masterId]
      );
      if (Array.isArray(masterRows) && masterRows.length > 0) {
        const masterRow = masterRows[0];
        const ratingRaw = masterRow.ratingAve;
        const ratingNum = ratingRaw != null ? Number(ratingRaw) : null;
        ratingAverage = Number.isFinite(ratingNum) ? ratingNum : null;
        masterRecord =
          typeof masterRow.name === "string" && masterRow.name.trim()
            ? masterRow.name.trim()
            : null;
        masterArtist =
          typeof masterRow.artist === "string" && masterRow.artist.trim()
            ? masterRow.artist.trim()
            : null;
        masterCover =
          typeof masterRow.cover === "string" && masterRow.cover.trim()
            ? masterRow.cover.trim()
            : null;
      }
    } catch (err) {
      console.warn("Failed to load master metadata", err);
      ratingAverage = null;
      masterRecord = null;
      masterArtist = null;
      masterCover = null;
    }

    res.json({
      masterId,
      ratingAverage,
      record: masterRecord,
      artist: masterArtist,
      cover: masterCover,
      reviews,
      sort: sortOption,
    });
  } catch (error) {
    console.error("Failed to load master reviews", error);
    res.status(500).json({ error: "Failed to load master reviews" });
  }
});

app.get("/api/community/search", async (req, res) => {
  console.log("Community user search...");
  const rawQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (rawQuery.length < 2) {
    return res.json([]);
  }
  try {
    const pool = await getPool();
    const likeTerm = `%${escapeForLike(rawQuery)}%`;
    const [rows] = await pool.query(
      `SELECT u.username, u.displayName, u.profilePic,
              (SELECT COUNT(*) FROM Follows WHERE followsUuid = u.uuid) AS followersCount,
              (SELECT COUNT(*) FROM Follows WHERE userUuid = u.uuid) AS followingCount
       FROM User u
       WHERE u.username LIKE ? OR u.displayName LIKE ?
       ORDER BY u.username
       LIMIT 10`,
      [likeTerm, likeTerm]
    );
    const results = rows.map(mapCommunityUserSummary);
    res.json(results);
  } catch (error) {
    console.error("Community user search failed", error);
    res.status(500).json({ error: "Failed to search users" });
  }
});

app.get("/api/community/users/:username", async (req, res) => {
  console.log("Fetching public profile...");
  const targetUsername = req.params.username;
  if (!targetUsername) {
    return res.status(400).json({ error: "Username is required" });
  }
  
  // Optional auth - extract userUuid from token if present
  let authenticatedUserUuid = null;
  const token = req.cookies.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      authenticatedUserUuid = payload.userUuid;
    } catch {
      // Invalid token, continue as unauthenticated
    }
  }
  
  try {
    const pool = await getPool();
    const userRow = await getUserByUsername(pool, targetUsername);
    if (!userRow) {
      return res.status(404).json({ error: "User not found" });
    }

    const publicUser = normalizePublicUser(userRow);

    let isFollowing = null;
    if (authenticatedUserUuid && userRow.uuid !== authenticatedUserUuid) {
      const [followRows] = await pool.query(
        `SELECT 1 FROM Follows WHERE userUuid = ? AND followsUuid = ? LIMIT 1`,
        [authenticatedUserUuid, userRow.uuid]
      );
      isFollowing = Array.isArray(followRows) && followRows.length > 0;
    }

    const highlightIds = await getProfileHighlightIds(pool, userRow.uuid);

    const defaultCollectionRow = await getUserTableRow(
      pool,
      userRow.uuid,
      DEFAULT_COLLECTION_NAME
    );
    const wishlistRow = await getUserTableRow(
      pool,
      userRow.uuid,
      WISHLIST_COLLECTION_NAME
    );
    const listenedRow = await getUserTableRow(
      pool,
      userRow.uuid,
      LISTENED_COLLECTION_NAME
    );
    const isOwner = authenticatedUserUuid && userRow.uuid === authenticatedUserUuid;
    const collectionPrivate = defaultCollectionRow
      ? Number(defaultCollectionRow.isPrivate) === 1
      : false;
    const wishlistPrivate = wishlistRow
      ? Number(wishlistRow.isPrivate) === 1
      : true;
    const listenedPrivate = listenedRow
      ? Number(listenedRow.isPrivate) === 1
      : false;

    let highlights = [];
    if (highlightIds.length > 0) {
      const fetchedHighlights = await fetchRecordsWithTagsByIds(
        pool,
        userRow.uuid,
        highlightIds
      );
      highlights = fetchedHighlights;
    }

    let recentRecords = [];
    if (!collectionPrivate || isOwner) {
    const [recentRows] = await pool.query(
  `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review
       FROM Record r
       JOIN RecTable t ON r.tableId = t.id
       WHERE r.userUuid = ? AND t.name = ?
       ORDER BY r.added DESC
       LIMIT ?`,
        [userRow.uuid, DEFAULT_COLLECTION_NAME, PROFILE_RECENT_PREVIEW_LIMIT]
      );

      const recentRecordIds = recentRows.map((row) => row.id);
      const tagsByRecord = await fetchTagsByRecordIds(pool, recentRecordIds);
      recentRecords = recentRows.map((row) => ({
        ...row,
        tags: tagsByRecord[row.id] || [],
      }));
    }

    let wishlistRecords = [];
    if (wishlistRow && (!wishlistPrivate || isOwner)) {
      const [wishlistRows] = await pool.query(
  `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review
       FROM Record r
       JOIN RecTable t ON r.tableId = t.id
       WHERE r.userUuid = ? AND t.name = ?
       ORDER BY r.rating DESC, r.added DESC
       LIMIT ?`,
        [userRow.uuid, WISHLIST_COLLECTION_NAME, PROFILE_WISHLIST_PREVIEW_LIMIT]
      );

      const wishlistIds = wishlistRows.map((row) => row.id);
      const wishlistTags = await fetchTagsByRecordIds(pool, wishlistIds);
      wishlistRecords = wishlistRows.map((row) => ({
        ...row,
        tags: wishlistTags[row.id] || [],
      }));
    }

    let listenedRecords = [];
    if (listenedRow && (!listenedPrivate || isOwner)) {
      const [listenedRows] = await pool.query(
        `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review
         FROM Record r
         JOIN RecTable t ON r.tableId = t.id
         WHERE r.userUuid = ? AND t.name = ?
         ORDER BY r.added DESC
         LIMIT ?`,
        [userRow.uuid, LISTENED_COLLECTION_NAME, PROFILE_LISTENED_PREVIEW_LIMIT]
      );

      const listenedIds = listenedRows.map((row) => row.id);
      const listenedTags = await fetchTagsByRecordIds(pool, listenedIds);
      listenedRecords = listenedRows.map((row) => ({
        ...row,
        tags: listenedTags[row.id] || [],
      }));
    }

    res.json({
      ...publicUser,
      highlights,
      recentRecords,
      isFollowing,
      collectionPrivate,
      wishlistRecords,
      wishlistPrivate,
      listenedRecords,
      listenedPrivate,
    });
  } catch (error) {
    console.error("Failed to load public profile", error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.get(
  "/api/community/users/:username/collection",
  async (req, res) => {
    console.log("Fetching public collection...");
    const targetUsername = req.params.username;
    const tableName = DEFAULT_COLLECTION_NAME;
    
    if (!targetUsername) {
      return res.status(400).json({ error: "Username is required" });
    }
    
    // Optional auth - extract userUuid from token if present
    let authenticatedUserUuid = null;
    const token = req.cookies.token;
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        authenticatedUserUuid = payload.userUuid;
      } catch {
        // Invalid token, continue as unauthenticated
      }
    }
    
    try {
      const pool = await getPool();
      const userRow = await getUserByUsername(pool, targetUsername);
      if (!userRow) {
        return res.status(404).json({ error: "User not found" });
      }

      const tableRow = await getUserTableRow(pool, userRow.uuid, tableName);
      if (!tableRow) {
        return res.status(404).json({ error: "Collection not found" });
      }

      const isOwner = authenticatedUserUuid && userRow.uuid === authenticatedUserUuid;
      if (tableRow.isPrivate && !isOwner) {
        return res.status(403).json({ error: "This collection is private" });
      }

      const [rows] = await pool.query(
        `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review
         FROM Record r WHERE r.userUuid = ? AND r.tableId = ?`,
        [userRow.uuid, tableRow.id]
      );

      const recordIds = rows.map((row) => row.id);
      const tagsByRecord = await fetchTagsByRecordIds(pool, recordIds);
      const response = rows.map((row) => ({
        ...row,
        tags: tagsByRecord[row.id] || [],
      }));
      res.json(response);
    } catch (error) {
      console.error("Failed to load public collection", error);
      res.status(500).json({ error: "Failed to load collection" });
    }
  }
);

app.get(
  "/api/community/users/:username/wishlist",
  async (req, res) => {
    console.log("Fetching public wishlist...");
    const targetUsername = req.params.username;
    const tableName = WISHLIST_COLLECTION_NAME;
    
    if (!targetUsername) {
      return res.status(400).json({ error: "Username is required" });
    }
    
    // Optional auth - extract userUuid from token if present
    let authenticatedUserUuid = null;
    const token = req.cookies.token;
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        authenticatedUserUuid = payload.userUuid;
      } catch {
        // Invalid token, continue as unauthenticated
      }
    }
    
    try {
      const pool = await getPool();
      const userRow = await getUserByUsername(pool, targetUsername);
      if (!userRow) {
        return res.status(404).json({ error: "User not found" });
      }

      const tableRow = await getUserTableRow(pool, userRow.uuid, tableName);
      if (!tableRow) {
        return res.status(404).json({ error: "Wishlist not found" });
      }

      const isOwner = authenticatedUserUuid && userRow.uuid === authenticatedUserUuid;
      if (tableRow.isPrivate && !isOwner) {
        return res.status(403).json({ error: "This wishlist is private" });
      }

      const [rows] = await pool.query(
        `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review
         FROM Record r WHERE r.userUuid = ? AND r.tableId = ?`,
        [userRow.uuid, tableRow.id]
      );

      const recordIds = rows.map((row) => row.id);
      const tagsByRecord = await fetchTagsByRecordIds(pool, recordIds);
      const response = rows.map((row) => ({
        ...row,
        tags: tagsByRecord[row.id] || [],
      }));
      res.json(response);
    } catch (error) {
      console.error("Failed to load public wishlist", error);
      res.status(500).json({ error: "Failed to load wishlist" });
    }
  }
);

app.get(
  "/api/community/users/:username/listened",
  async (req, res) => {
    console.log("Fetching public listened...");
    const targetUsername = req.params.username;
    const tableName = LISTENED_COLLECTION_NAME;
    
    if (!targetUsername) {
      return res.status(400).json({ error: "Username is required" });
    }
    
    // Optional auth - extract userUuid from token if present
    let authenticatedUserUuid = null;
    const token = req.cookies.token;
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        authenticatedUserUuid = payload.userUuid;
      } catch {
        // Invalid token, continue as unauthenticated
      }
    }
    
    try {
      const pool = await getPool();
      const userRow = await getUserByUsername(pool, targetUsername);
      if (!userRow) {
        return res.status(404).json({ error: "User not found" });
      }

      const tableRow = await getUserTableRow(pool, userRow.uuid, tableName);
      if (!tableRow) {
        return res.status(404).json({ error: "Listened collection not found" });
      }

      const isOwner = authenticatedUserUuid && userRow.uuid === authenticatedUserUuid;
      if (tableRow.isPrivate && !isOwner) {
        return res.status(403).json({ error: "This listened collection is private" });
      }

      const [rows] = await pool.query(
        `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review
         FROM Record r WHERE r.userUuid = ? AND r.tableId = ?`,
        [userRow.uuid, tableRow.id]
      );

      const recordIds = rows.map((row) => row.id);
      const tagsByRecord = await fetchTagsByRecordIds(pool, recordIds);
      const response = rows.map((row) => ({
        ...row,
        tags: tagsByRecord[row.id] || [],
      }));
      res.json(response);
    } catch (error) {
      console.error("Failed to load public listened collection", error);
      res.status(500).json({ error: "Failed to load listened collection" });
    }
  }
);

app.get(
  "/api/community/users/:username/follows",
  async (req, res) => {
    console.log("Fetching followers/following...");
    const targetUsername = req.params.username;
    if (!targetUsername) {
      return res.status(400).json({ error: "Username is required" });
    }

    try {
      const pool = await getPool();
      const userRow = await getUserByUsername(pool, targetUsername);
      if (!userRow) {
        return res.status(404).json({ error: "User not found" });
      }

      const [followers, following] = await Promise.all([
        getFollowersForUser(pool, userRow.uuid),
        getFollowingForUser(pool, userRow.uuid),
      ]);

      res.json({ followers, following });
    } catch (error) {
      console.error("Failed to load follows", error);
      res.status(500).json({ error: "Failed to load follows" });
    }
  }
);

app.get("/api/activity", requireAuth, async (req, res) => {
  const scopeRaw =
    typeof req.query.scope === "string" ? req.query.scope.toLowerCase() : "friends";
  const scope = scopeRaw === "you" ? "you" : "friends";
  const limitRaw = Number(req.query.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;
  const offsetRaw = Number(req.query.offset);
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  console.log(`Fetching activity feed for scope=${scope}, limit=${limit}, offset=${offset}`);

  try {
    const pool = await getPool();
    let recordRows, listRows, likedReviewRows, likedListRows;

    if (scope === "friends") {
      // Get records from followed users
      [recordRows] = await pool.query(
        `SELECT 'record' as activityType, r.id, r.name as record, r.artist, r.cover, r.rating,
                r.release_year as 'release', r.added as timestamp, r.tableId, r.isCustom as isCustom,
                r.masterId as masterId, r.review as review, r.reviewLikes,
                u.username, u.displayName, u.profilePic, t.name as tableName,
                EXISTS(SELECT 1 FROM LikedReview lr WHERE lr.userUuid = ? AND lr.recordId = r.id) as viewerHasLikedReview
           FROM Record r
           JOIN Follows f ON f.followsUuid = r.userUuid
           JOIN User u ON u.uuid = r.userUuid
           JOIN RecTable t ON r.tableId = t.id
          WHERE f.userUuid = ? AND t.isPrivate = 0`,
        [req.userUuid, req.userUuid]
      );
      // Get lists from followed users
      [listRows] = await pool.query(
        `SELECT 'list' as activityType, l.id, l.name as listName, l.description, l.picture,
                l.created as timestamp, l.likes,
                u.username, u.displayName, u.profilePic,
                COALESCE(stats.recordCount, 0) as recordCount,
                EXISTS(SELECT 1 FROM ListLike ll WHERE ll.userUuid = ? AND ll.listId = l.id) as likedByCurrentUser
           FROM List l
           JOIN Follows f ON f.followsUuid = l.userUuid
           JOIN User u ON u.uuid = l.userUuid
           LEFT JOIN (
             SELECT listId, COUNT(*) AS recordCount FROM ListRecord GROUP BY listId
           ) stats ON stats.listId = l.id
          WHERE f.userUuid = ? AND l.isPrivate = 0 AND COALESCE(stats.recordCount, 0) > 0`,
        [req.userUuid, req.userUuid]
      );
      // Get liked reviews from followed users
      [likedReviewRows] = await pool.query(
        `SELECT 'liked-review' as activityType, lr.created as timestamp, lr.recordId,
                r.id, r.name as record, r.artist,
                liker.username as likerUsername, liker.displayName as likerDisplayName, liker.profilePic as likerProfilePic,
                owner.username as ownerUsername, owner.displayName as ownerDisplayName
           FROM LikedReview lr
           JOIN Follows f ON f.followsUuid = lr.userUuid
           JOIN User liker ON liker.uuid = lr.userUuid
           JOIN Record r ON r.id = lr.recordId
           JOIN User owner ON owner.uuid = r.userUuid
           JOIN RecTable t ON r.tableId = t.id
          WHERE f.userUuid = ? AND r.review IS NOT NULL AND r.review != '' AND t.isPrivate = 0`,
        [req.userUuid]
      );
      console.log(`Liked reviews fetched: ${likedReviewRows.length}`);
      if (likedReviewRows.length > 0) {
        console.log('Sample liked review:', likedReviewRows[0]);
      }
      // Get liked lists from followed users
      [likedListRows] = await pool.query(
        `SELECT 'liked-list' as activityType, ll.created as timestamp, ll.listId,
                l.id, l.name as listName,
                liker.username as likerUsername, liker.displayName as likerDisplayName, liker.profilePic as likerProfilePic,
                owner.username as ownerUsername, owner.displayName as ownerDisplayName
           FROM ListLike ll
           JOIN Follows f ON f.followsUuid = ll.userUuid
           JOIN User liker ON liker.uuid = ll.userUuid
           JOIN List l ON l.id = ll.listId
           JOIN User owner ON owner.uuid = l.userUuid
          WHERE f.userUuid = ? AND l.isPrivate = 0`,
        [req.userUuid]
      );
      console.log(`Liked lists fetched: ${likedListRows.length}`);
      if (likedListRows.length > 0) {
        console.log('Sample liked list:', likedListRows[0]);
      }
    } else {
      // Get user's own records
      [recordRows] = await pool.query(
        `SELECT 'record' as activityType, r.id, r.name as record, r.artist, r.cover, r.rating,
                r.release_year as 'release', r.added as timestamp, r.tableId, r.isCustom as isCustom,
                r.masterId as masterId, r.review as review, r.reviewLikes,
                u.username, u.displayName, u.profilePic, t.name as tableName,
                FALSE as viewerHasLikedReview
           FROM Record r
           JOIN User u ON u.uuid = r.userUuid
           LEFT JOIN RecTable t ON r.tableId = t.id
          WHERE r.userUuid = ?`,
        [req.userUuid]
      );
      // Get user's own lists
      [listRows] = await pool.query(
        `SELECT 'list' as activityType, l.id, l.name as listName, l.description, l.picture,
                l.created as timestamp, l.likes,
                u.username, u.displayName, u.profilePic,
                COALESCE(stats.recordCount, 0) as recordCount,
                FALSE as likedByCurrentUser
           FROM List l
           JOIN User u ON u.uuid = l.userUuid
           LEFT JOIN (
             SELECT listId, COUNT(*) AS recordCount FROM ListRecord GROUP BY listId
           ) stats ON stats.listId = l.id
          WHERE l.userUuid = ? AND COALESCE(stats.recordCount, 0) > 0`,
        [req.userUuid]
      );
      // Get user's own liked reviews
      [likedReviewRows] = await pool.query(
        `SELECT 'liked-review' as activityType, lr.created as timestamp, lr.recordId,
                r.id, r.name as record, r.artist,
                viewer.username as likerUsername, viewer.displayName as likerDisplayName, viewer.profilePic as likerProfilePic,
                owner.username as ownerUsername, owner.displayName as ownerDisplayName
           FROM LikedReview lr
           JOIN User viewer ON viewer.uuid = lr.userUuid
           JOIN Record r ON r.id = lr.recordId
           JOIN User owner ON owner.uuid = r.userUuid
           JOIN RecTable t ON r.tableId = t.id
          WHERE lr.userUuid = ? AND r.review IS NOT NULL AND r.review != '' AND t.isPrivate = 0`,
        [req.userUuid]
      );
      // Get user's own liked lists
      [likedListRows] = await pool.query(
        `SELECT 'liked-list' as activityType, ll.created as timestamp, ll.listId,
                l.id, l.name as listName,
                viewer.username as likerUsername, viewer.displayName as likerDisplayName, viewer.profilePic as likerProfilePic,
                owner.username as ownerUsername, owner.displayName as ownerDisplayName
           FROM ListLike ll
           JOIN User viewer ON viewer.uuid = ll.userUuid
           JOIN List l ON l.id = ll.listId
           JOIN User owner ON owner.uuid = l.userUuid
          WHERE ll.userUuid = ? AND l.isPrivate = 0`,
        [req.userUuid]
      );
    }

    // Combine and sort all activity
    const allActivity = [
      ...(Array.isArray(recordRows) ? recordRows : []),
      ...(Array.isArray(listRows) ? listRows : []),
      ...(Array.isArray(likedReviewRows) ? likedReviewRows : []),
      ...(Array.isArray(likedListRows) ? likedListRows : [])
    ];
    
    allActivity.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return b.id - a.id;
    });

    // Apply pagination
    const paginatedActivity = allActivity.slice(offset, offset + limit);

    if (paginatedActivity.length === 0) {
      return res.json([]);
    }

    const listIds = Array.from(
      new Set(
        paginatedActivity
          .filter((row) => row.activityType === 'list')
          .map((row) => Number(row.id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );

    const previewRecordsByListId = new Map();
    if (listIds.length > 0) {
      const [previewRows] = await pool.query(
        `SELECT lr.listId, lr.id, lr.name, lr.cover, lr.artist
           FROM ListRecord lr
          WHERE lr.listId IN (?)
          ORDER BY lr.listId ASC, lr.sortOrder ASC, lr.added DESC, lr.id DESC`,
        [listIds]
      );

      if (Array.isArray(previewRows)) {
        for (const row of previewRows) {
          const listId = Number(row.listId);
          if (!Number.isInteger(listId) || listId <= 0) {
            continue;
          }
          const existing = previewRecordsByListId.get(listId) || [];
          if (existing.length >= 3) {
            continue;
          }
          const recordIdValue = Number(row.id);
          existing.push({
            id: Number.isInteger(recordIdValue) && recordIdValue > 0 ? recordIdValue : 0,
            name: typeof row.name === 'string' ? row.name : '',
            artist: typeof row.artist === 'string' ? row.artist : '',
            cover:
              typeof row.cover === 'string' && row.cover.trim()
                ? row.cover.trim()
                : null,
          });
          previewRecordsByListId.set(listId, existing);
        }
      }
    }

    // Get record IDs for tag fetching (only for regular record activity, not liked reviews)
    const recordIds = paginatedActivity
      .filter(row => row.activityType === 'record')
      .map(row => row.id);
    const tagsByRecord = recordIds.length > 0 ? await fetchTagsByRecordIds(pool, recordIds) : {};

    const feed = paginatedActivity.map((row) => {
      // Handle liked-review activity
      if (row.activityType === 'liked-review') {
        const likerDisplayName =
          typeof row.likerDisplayName === "string" && row.likerDisplayName.trim()
            ? row.likerDisplayName.trim()
            : null;
        const ownerDisplayName =
          typeof row.ownerDisplayName === "string" && row.ownerDisplayName.trim()
            ? row.ownerDisplayName.trim()
            : null;

        return {
          type: 'liked-review',
          liker: {
            username: row.likerUsername,
            displayName: likerDisplayName,
            profilePicUrl: buildProfilePicPublicPath(row.likerProfilePic),
          },
          reviewOwner: {
            username: row.ownerUsername,
            displayName: ownerDisplayName,
          },
          record: {
            id: row.id,
            name: row.record,
            artist: row.artist,
          },
          likedAt: row.timestamp,
        };
      }

      // Handle liked-list activity
      if (row.activityType === 'liked-list') {
        const likerDisplayName =
          typeof row.likerDisplayName === "string" && row.likerDisplayName.trim()
            ? row.likerDisplayName.trim()
            : null;
        const ownerDisplayName =
          typeof row.ownerDisplayName === "string" && row.ownerDisplayName.trim()
            ? row.ownerDisplayName.trim()
            : null;

        return {
          type: 'liked-list',
          liker: {
            username: row.likerUsername,
            displayName: likerDisplayName,
            profilePicUrl: buildProfilePicPublicPath(row.likerProfilePic),
          },
          listOwner: {
            username: row.ownerUsername,
            displayName: ownerDisplayName,
          },
          list: {
            id: row.id,
            name: row.listName,
          },
          likedAt: row.timestamp,
        };
      }

      const displayName =
        typeof row.displayName === "string" && row.displayName.trim()
          ? row.displayName.trim()
          : null;

      // Handle list activity
      if (row.activityType === 'list') {
        const previews = previewRecordsByListId.get(row.id) || [];
        return {
          type: 'list',
          owner: {
            username: row.username,
            displayName,
            profilePicUrl: buildProfilePicPublicPath(row.profilePic),
          },
          list: {
            id: row.id,
            name: row.listName,
            description: typeof row.description === 'string' && row.description.trim()
              ? row.description.trim()
              : null,
            picture: buildListPicPublicPath(
              typeof row.picture === 'string' && row.picture.trim()
                ? row.picture.trim()
                : null
            ),
            recordCount: row.recordCount,
            created: row.timestamp,
            likes: normalizeNonNegativeInt(row.likes),
            likedByCurrentUser: Boolean(row.likedByCurrentUser),
          },
          previewRecords: previews,
        };
      }

      // Handle record activity
      const ratingRaw = Number(row.rating);
      const rating = Number.isFinite(ratingRaw) ? ratingRaw : 0;
      const releaseRaw = Number(row.release);
      const release = Number.isFinite(releaseRaw) ? releaseRaw : 0;
      const masterIdRaw = Number(row.masterId);
      const masterId =
        Number.isInteger(masterIdRaw) && masterIdRaw > 0 ? masterIdRaw : null;
  const added = row.timestamp;
      const cover =
        typeof row.cover === "string" && row.cover ? row.cover : undefined;
      const tags = tagsByRecord[row.id] || [];
      const review =
        typeof row.review === "string" && row.review.trim()
          ? row.review.trim()
          : null;
      const tableName =
        typeof row.tableName === "string" && row.tableName.trim()
          ? row.tableName.trim()
          : row.tableName === null
          ? null
          : undefined;

      const record = {
        id: row.id,
        record: row.record,
        artist: row.artist,
        review,
        rating,
        isCustom: Boolean(row.isCustom),
        release,
        added,
        tags,
        tableId: row.tableId,
        reviewLikes: normalizeNonNegativeInt(row.reviewLikes),
        viewerHasLikedReview: Boolean(row.viewerHasLikedReview),
      };

      if (cover) {
        record.cover = cover;
      }

      record.masterId = masterId;

      if (tableName !== undefined) {
        record.tableName = tableName;
      }

      return {
        type: 'record',
        owner: {
          username: row.username,
          displayName,
          profilePicUrl: buildProfilePicPublicPath(row.profilePic),
        },
        record,
      };
    });

    console.log(`Returning ${feed.length} feed items. Activity types: ${feed.map(f => f.type).join(', ')}`);
    res.json(feed);
  } catch (error) {
    console.error("Failed to load activity feed", error);
    res.status(500).json({ error: "Failed to load feed" });
  }
});

app.get("/api/tags", requireAuth, async (req, res) => {
  console.log("Fetching tags...");
  try {
    const pool = await getPool();
    const [rows] = await pool.query(`SELECT name FROM Tag WHERE userUuid = ? ORDER BY name`, [req.userUuid]);
    res.json(rows.map((r) => r.name));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// Full tag list including ids for clients that need stable identifiers
app.get("/api/tags/full", requireAuth, async (req, res) => {
  console.log("Fetching full tag list...");
  try {
    const pool = await getPool();
    const [rows] = await pool.query(`SELECT id, name FROM Tag WHERE userUuid = ? ORDER BY name`, [req.userUuid]);
    // return array of { id, name }
    res.json(rows.map((r) => ({ id: r.id, name: r.name })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

app.post(
  "/api/community/users/:username/follow",
  requireAuth,
  async (req, res) => {
    console.log("Following user...");
    const targetUsername = req.params.username;
    if (!targetUsername) {
      return res.status(400).json({ error: "Username is required" });
    }

    try {
      const pool = await getPool();
      const targetUser = await getUserByUsername(pool, targetUsername);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (targetUser.uuid === req.userUuid) {
        return res.status(400).json({ error: "You cannot follow yourself" });
      }

      try {
        await pool.execute(
          `INSERT INTO Follows (userUuid, followsUuid, created) VALUES (?, ?, UTC_TIMESTAMP())`,
          [req.userUuid, targetUser.uuid]
        );
      } catch (error) {
        if (!error || error.code !== "ER_DUP_ENTRY") {
          throw error;
        }
      }

      const [targetCounts, viewerCounts] = await Promise.all([
        getUserFollowCounts(pool, targetUser.uuid),
        getUserFollowCounts(pool, req.userUuid),
      ]);

      res.json({
        target: targetCounts,
        viewer: viewerCounts,
        isFollowing: true,
      });
    } catch (error) {
      console.error("Failed to follow user", error);
      res.status(500).json({ error: "Failed to follow user" });
    }
  }
);

app.delete(
  "/api/community/users/:username/follow",
  requireAuth,
  async (req, res) => {
    console.log("Unfollowing user...");
    const targetUsername = req.params.username;
    if (!targetUsername) {
      return res.status(400).json({ error: "Username is required" });
    }

    try {
      const pool = await getPool();
      const targetUser = await getUserByUsername(pool, targetUsername);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (targetUser.uuid === req.userUuid) {
        return res.status(400).json({ error: "You cannot unfollow yourself" });
      }

      await pool.execute(
        `DELETE FROM Follows WHERE userUuid = ? AND followsUuid = ?`,
        [req.userUuid, targetUser.uuid]
      );

      const [targetCounts, viewerCounts] = await Promise.all([
        getUserFollowCounts(pool, targetUser.uuid),
        getUserFollowCounts(pool, req.userUuid),
      ]);

      res.json({
        target: targetCounts,
        viewer: viewerCounts,
        isFollowing: false,
      });
    } catch (error) {
      console.error("Failed to unfollow user", error);
      res.status(500).json({ error: "Failed to unfollow user" });
    }
  }
);

// Register endpoint
app.post('/api/register', async (req, res) => {
  console.log("Registering user...");
  const { username, password, displayName: rawDisplayName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be 3-30 characters.' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username must contain only letters, numbers, and underscores.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!/(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one letter, one number, and one special character.' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userUuid = uuidv4();
    const displayName =
      typeof rawDisplayName === "string" && rawDisplayName.trim()
        ? rawDisplayName.trim().slice(0, 50)
        : username;
    const pool = await getPool();
    await pool.execute(
      'INSERT INTO User (uuid, username, displayName, password, bio, profilePic, created) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
      [userUuid, username.toLowerCase(), displayName, hashedPassword, null, null]
    );
    await pool.execute(
      `INSERT INTO RecTable (name, userUuid, isPrivate) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
      [
        DEFAULT_COLLECTION_NAME,
        userUuid,
        false,
        WISHLIST_COLLECTION_NAME,
        userUuid,
        false,
        LISTENED_COLLECTION_NAME,
        userUuid,
        false,
      ]
    );
    const token = issueToken(userUuid);
  res.cookie('token', token, { httpOnly: true, sameSite: process.env.CROSS_SITE_COOKIES === 'true' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7*24*60*60*1000 });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  console.log("Logging in...");
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(
      'SELECT uuid, password FROM User WHERE username = ?',
      [username]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    const token = issueToken(user.uuid);
  res.cookie('token', token, { httpOnly: true, sameSite: process.env.CROSS_SITE_COOKIES === 'true' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 365*24*60*60*1000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  console.log("Logging out...");
  res.clearCookie('token', { httpOnly: true, sameSite: process.env.CROSS_SITE_COOKIES === 'true' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ success: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  console.log("Fetching user info...");
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(
      `SELECT u.username,
              u.displayName,
              u.bio,
              u.profilePic,
              u.created,
              CASE WHEN a.userUuid IS NOT NULL THEN 1 ELSE 0 END AS isAdmin,
              COALESCE(a.canManageAdmins, 0) AS canManageAdmins,
              COALESCE(a.canDeleteUsers, 0) AS canDeleteUsers,
              (SELECT COUNT(*) FROM Follows WHERE followsUuid = u.uuid) AS followersCount,
              (SELECT COUNT(*) FROM Follows WHERE userUuid = u.uuid) AS followingCount
       FROM User u
       LEFT JOIN Admin a ON a.userUuid = u.uuid
       WHERE u.uuid = ?
       LIMIT 1`,
      [req.userUuid]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    // Also return the userUuid so clients can wire analytics user_id without decoding the token
    const userRow = rows[0];
    const profilePicUrl = buildProfilePicPublicPath(userRow.profilePic);
    const followersCountRaw = Number(userRow.followersCount);
    const followersCount = Number.isFinite(followersCountRaw)
      ? Math.max(0, Math.trunc(followersCountRaw))
      : 0;
    const followingCountRaw = Number(userRow.followingCount);
    const followingCount = Number.isFinite(followingCountRaw)
      ? Math.max(0, Math.trunc(followingCountRaw))
      : 0;
    const isAdmin = Boolean(userRow.isAdmin);
    const adminPermissions = {
      canManageAdmins: Boolean(userRow.canManageAdmins),
      canDeleteUsers: Boolean(userRow.canDeleteUsers),
    };
    req.isAdmin = isAdmin ? true : undefined;
    req.adminPermissions = isAdmin ? adminPermissions : undefined;

    res.json({
      username: userRow.username,
      displayName: userRow.displayName,
      bio: userRow.bio ?? null,
      profilePicUrl,
      userUuid: req.userUuid,
      followersCount,
      followingCount,
      joinedDate: normalizeDateOnly(userRow.created),
      isAdmin,
      adminPermissions,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

app.patch('/api/profile', requireAuth, async (req, res) => {
  console.log("Updating profile...");
  const { username: newUsername, displayName: rawDisplayName, bio: rawBio } = req.body || {};
  if (!newUsername && !rawDisplayName && rawBio === undefined) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  if (newUsername) {
    if (typeof newUsername !== 'string' || newUsername.trim().length < 3 || newUsername.trim().length > 30) {
      return res.status(400).json({ error: 'Username must be 3-30 characters.' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      return res.status(400).json({ error: 'Username must contain only letters, numbers, and underscores.' });
    }
  }

  let displayName;
  if (rawDisplayName !== undefined) {
    if (typeof rawDisplayName !== 'string' || !rawDisplayName.trim()) {
      return res.status(400).json({ error: 'Display name cannot be empty.' });
    }
    displayName = rawDisplayName.trim().slice(0, 50);
  }

  let bio;
  if (rawBio !== undefined) {
    if (rawBio === null) {
      bio = null;
    } else if (typeof rawBio !== 'string') {
      return res.status(400).json({ error: 'Bio must be a string.' });
    } else {
      const normalizedBio = rawBio.trim();
      if (normalizedBio.length > 255) {
        return res.status(400).json({ error: 'Bio must be 255 characters or fewer.' });
      }
      bio = normalizedBio.length > 0 ? normalizedBio : null;
    }
  }

  try {
    const pool = await getPool();
    if (newUsername) {
      const [existing] = await pool.execute(
        'SELECT uuid FROM User WHERE username = ? AND uuid <> ? LIMIT 1',
        [newUsername, req.userUuid]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Username already taken.' });
      }
    }

    const fields = [];
    const params = [];
    if (newUsername) {
      fields.push('username = ?');
      params.push(newUsername);
    }
    if (displayName !== undefined) {
      fields.push('displayName = ?');
      params.push(displayName);
    }
    if (rawBio !== undefined) {
      fields.push('bio = ?');
      params.push(bio);
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    params.push(req.userUuid);
    await pool.execute(
      `UPDATE User SET ${fields.join(', ')} WHERE uuid = ?`,
      params
    );

    const [rows] = await pool.execute(
      'SELECT username, displayName, bio, profilePic FROM User WHERE uuid = ?',
      [req.userUuid]
    );
    const updatedUser = rows[0];
    res.json({
      success: true,
      user: {
        username: updatedUser.username,
        displayName: updatedUser.displayName,
        bio: updatedUser.bio ?? null,
        profilePicUrl: buildProfilePicPublicPath(updatedUser.profilePic),
      },
    });
  } catch (err) {
    console.error('Profile update failed', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.post('/api/profile/avatar', requireAuth, (req, res) => {
  console.log("Uploading profile picture...");
  profilePicUpload.single('avatar')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'Profile picture is too large.' });
        }
        return res.status(400).json({ error: err.message || 'Upload failed.' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const relativePath = buildProfilePicRelativePath(file.filename);

    try {
      const pool = await getPool();
      const [rows] = await pool.execute(
        'SELECT profilePic FROM User WHERE uuid = ? LIMIT 1',
        [req.userUuid]
      );
      if (!rows || rows.length === 0) {
        await deleteProfilePicFile(relativePath);
        return res.status(404).json({ error: 'User not found' });
      }

      const previousPath = rows[0].profilePic;

      await pool.execute('UPDATE User SET profilePic = ? WHERE uuid = ?', [relativePath, req.userUuid]);

      if (previousPath && previousPath !== relativePath) {
        await deleteProfilePicFile(previousPath);
      }

      res.json({
        success: true,
        profilePicUrl: buildProfilePicPublicPath(relativePath),
      });
    } catch (error) {
  console.error('Failed to save profile picture', error);
      await deleteProfilePicFile(relativePath);
      res.status(500).json({ error: 'Failed to save profile picture' });
    }
  });
});

app.delete('/api/profile/avatar', requireAuth, async (req, res) => {
  console.log("Removing profile picture...");
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(
      'SELECT profilePic FROM User WHERE uuid = ? LIMIT 1',
      [req.userUuid]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentPath = rows[0].profilePic;
    if (!currentPath) {
      return res.json({ success: true, profilePicUrl: null });
    }

    await pool.execute('UPDATE User SET profilePic = NULL WHERE uuid = ?', [req.userUuid]);
    await deleteProfilePicFile(currentPath);

    res.json({ success: true, profilePicUrl: null });
  } catch (error) {
    console.error('Failed to remove profile picture', error);
    res.status(500).json({ error: 'Failed to remove profile picture' });
  }
});

app.post('/api/profile/password', requireAuth, async (req, res) => {
  console.log("Changing password...");
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'All password fields are required.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New passwords do not match.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!/(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])/.test(newPassword)) {
    return res.status(400).json({ error: 'Password must contain at least one letter, one number, and one special character.' });
  }

  try {
    const pool = await getPool();
    const [rows] = await pool.execute('SELECT password FROM User WHERE uuid = ?', [req.userUuid]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const hash = rows[0].password;
    const matches = await bcrypt.compare(currentPassword, hash);
    if (!matches) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE User SET password = ? WHERE uuid = ?', [newHash, req.userUuid]);
    res.json({ success: true });
  } catch (err) {
    console.error('Password change failed', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Serve static built frontend in production (Vite outputs to `dist`)
if (process.env.NODE_ENV === 'production') {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const clientDist = path.join(__dirname, 'dist');
    app.use(express.static(clientDist));
    // Don't let the SPA fallback swallow API requests - skip paths that start with /api
    app.get('*', (req, res, next) => {
      if (req.path && req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
    console.log('Serving static frontend from', clientDist);
  } catch (e) {
    console.warn('Could not enable static serving of frontend:', e && e.message);
  }
}

// Get a single record by ID
// Supports both authenticated user's own records and public records when username query param is provided
app.get('/api/records/:id', async (req, res) => {
  console.log('Fetching single record...');
  const recordId = Number.parseInt(req.params.id, 10);
  const { username } = req.query;
  
  if (!Number.isInteger(recordId) || recordId <= 0) {
    return res.status(400).json({ error: 'Invalid record ID' });
  }
  
  // Optional auth - extract userUuid from token if present
  let authenticatedUserUuid = null;
  const token = req.cookies.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      authenticatedUserUuid = payload.userUuid;
    } catch {
      // Invalid token, continue as unauthenticated
    }
  }

  try {
    const pool = await getPool();
    
    if (username && typeof username === 'string') {
      // Public record access - fetch by username
      const trimmedUsername = username.trim();
      const [userRows] = await pool.execute(
        'SELECT uuid, username, displayName, profilePic FROM User WHERE username = ? LIMIT 1',
        [trimmedUsername]
      );
      
      if (userRows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const targetUser = userRows[0];
      const targetUserUuid = targetUser.uuid;
      
      // Fetch the record owned by this user
      const [recordRows] = await pool.execute(
  `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', 
    r.added, r.tableId, r.isCustom, r.masterId, r.review, r.reviewLikes,
                rt.name as tableName, rt.isPrivate
         FROM Record r
         JOIN RecTable rt ON r.tableId = rt.id
         WHERE r.id = ? AND r.userUuid = ?
         LIMIT 1`,
        [recordId, targetUserUuid]
      );
      
      if (recordRows.length === 0) {
        return res.status(404).json({ error: 'Record not found' });
      }
      
      const record = recordRows[0];
      
      // Check if collection is private and user is not authenticated as owner
      if (record.isPrivate) {
        const isOwner = authenticatedUserUuid && authenticatedUserUuid === targetUserUuid;
        if (!isOwner) {
          return res.status(403).json({ error: 'This record is private' });
        }
      }
      
      // Fetch tags
      const [tagRows] = await pool.execute(
        `SELECT t.name FROM Tag t JOIN Tagged tg ON t.id = tg.tagId WHERE tg.recordId = ?`,
        [recordId]
      );
      record.tags = tagRows.map(t => t.name);

      const reviewLikesValue = Number(record.reviewLikes);
      record.reviewLikes = Number.isFinite(reviewLikesValue)
        ? reviewLikesValue
        : 0;

      let viewerHasLikedReview = false;
      if (authenticatedUserUuid) {
        const [likedRows] = await pool.execute(
          `SELECT 1 FROM LikedReview WHERE userUuid = ? AND recordId = ? LIMIT 1`,
          [authenticatedUserUuid, recordId]
        );
        viewerHasLikedReview = Array.isArray(likedRows) && likedRows.length > 0;
      }
      record.viewerHasLikedReview = viewerHasLikedReview;
      
      // Add owner info
      const owner = {
        username: targetUser.username,
        displayName: targetUser.displayName || null,
        profilePicUrl: buildProfilePicPublicPath(targetUser.profilePic),
      };
      
      // Format collection name
      record.collectionName = record.tableName;
      delete record.isPrivate;
      delete record.tableName;
      
      res.json({ record, owner });
    } else {
      // Authenticated user's own record
      if (!authenticatedUserUuid) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const [recordRows] = await pool.execute(
  `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release',
    r.added, r.tableId, r.isCustom, r.masterId, r.review, r.reviewLikes,
                rt.name as tableName, rt.isPrivate
         FROM Record r
         JOIN RecTable rt ON r.tableId = rt.id
         WHERE r.id = ? AND r.userUuid = ?
         LIMIT 1`,
        [recordId, authenticatedUserUuid]
      );
      
      if (recordRows.length === 0) {
        return res.status(404).json({ error: 'Record not found' });
      }
      
      const record = recordRows[0];
      
      // Fetch tags
      const [tagRows] = await pool.execute(
        `SELECT t.name FROM Tag t JOIN Tagged tg ON t.id = tg.tagId WHERE tg.recordId = ?`,
        [recordId]
      );
      record.tags = tagRows.map(t => t.name);

      const reviewLikesValue = Number(record.reviewLikes);
      record.reviewLikes = Number.isFinite(reviewLikesValue)
        ? reviewLikesValue
        : 0;
      record.viewerHasLikedReview = false;
      
      // Format collection name
  record.collectionName = record.tableName;
  // expose collection privacy for owner's view so UI can hide sharing when private
  record.collectionPrivate = Number(record.isPrivate) === 1;
  delete record.isPrivate;
  delete record.tableName;
      
      res.json({ record, owner: null });
    }
  } catch (err) {
    console.error('Failed to fetch record', err);
    res.status(500).json({ error: 'Failed to fetch record' });
  }
});

app.post('/api/records/:id/review/like', requireAuth, async (req, res) => {
  const recordId = Number.parseInt(req.params.id, 10);
  console.log('Liking review for record ID:', recordId);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    return res.status(400).json({ error: 'Invalid record ID' });
  }

  try {
    const pool = await getPool();
    const [recordRows] = await pool.execute(
      `SELECT userUuid, review, reviewLikes FROM Record WHERE id = ? LIMIT 1`,
      [recordId]
    );

    if (!Array.isArray(recordRows) || recordRows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const record = recordRows[0];
    if (!record.review || !record.review.toString().trim()) {
      return res.status(400).json({ error: 'That record does not have a review to like.' });
    }

    if (record.userUuid === req.userUuid) {
      return res.status(400).json({ error: "You can't like your own review." });
    }

    await pool.execute(
      `INSERT IGNORE INTO LikedReview (userUuid, recordId, created) VALUES (?, ?, UTC_TIMESTAMP())` ,
      [req.userUuid, recordId]
    );

    const [likesRows] = await pool.execute(
      `SELECT reviewLikes FROM Record WHERE id = ? LIMIT 1`,
      [recordId]
    );
    const likeCount = Array.isArray(likesRows) && likesRows.length > 0
      ? Number(likesRows[0].reviewLikes) || 0
      : 0;

    res.json({ liked: true, reviewLikes: likeCount });
  } catch (error) {
    console.error('Failed to like review', error);
    res.status(500).json({ error: 'Failed to like review' });
  }
});

app.delete('/api/records/:id/review/like', requireAuth, async (req, res) => {
  const recordId = Number.parseInt(req.params.id, 10);
  console.log('Removing review like from record ID:', recordId);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    return res.status(400).json({ error: 'Invalid record ID' });
  }

  try {
    const pool = await getPool();
    await pool.execute(
      `DELETE FROM LikedReview WHERE userUuid = ? AND recordId = ?`,
      [req.userUuid, recordId]
    );

    const [likesRows] = await pool.execute(
      `SELECT reviewLikes FROM Record WHERE id = ? LIMIT 1`,
      [recordId]
    );
    const likeCount = Array.isArray(likesRows) && likesRows.length > 0
      ? Number(likesRows[0].reviewLikes) || 0
      : 0;

    res.json({ liked: false, reviewLikes: likeCount });
  } catch (error) {
    console.error('Failed to remove review like', error);
    res.status(500).json({ error: 'Failed to update review like' });
  }
});

// Create or update a record
app.post('/api/records/update', requireAuth, async (req, res) => {
  console.log("Updating record...");
  const { id, record, artist, cover, rating, tags, release } = req.body;
  const hasReviewField = Object.prototype.hasOwnProperty.call(
    req.body ?? {},
    "review"
  );
  const rawReview = req.body?.review;
  if (!id || !record) return res.status(400).json({ error: 'Missing id or record name' });

  const releaseNum = Number(release);
  if (!Number.isInteger(releaseNum) || releaseNum < 1901 || releaseNum > 2100) {
    return res.status(400).json({ error: 'Invalid release year' });
  }

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 0 || ratingNum > 10) {
    return res.status(400).json({ error: 'Invalid rating' });
  }

  try {
    const pool = await getPool();
    const [existingRows] = await pool.execute(
      `SELECT name, artist, isCustom, review FROM Record WHERE id = ? AND userUuid = ? LIMIT 1`,
      [id, req.userUuid]
    );

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const existing = existingRows[0];
    const isCustom = Boolean(existing.isCustom);

    if (!isCustom) {
      const currentName = existing.name || "";
      const currentArtist = existing.artist || "";
      if (currentName !== record || currentArtist !== artist) {
        return res.status(400).json({ error: 'Only custom records can edit the title or artist.' });
      }
    }

    const nextName = isCustom ? record : existing.name;
    const nextArtist = isCustom ? artist : existing.artist;
    let normalizedReview = existing.review ?? null;
    if (hasReviewField) {
      if (typeof rawReview === "string") {
        const trimmed = rawReview.trim();
        normalizedReview = trimmed.length > 0 ? trimmed.slice(0, 4000) : null;
      } else if (rawReview === null) {
        normalizedReview = null;
      }
    }

    const [updateResult] = await pool.execute(
      `UPDATE Record SET name = ?, artist = ?, cover = ?, rating = ?, release_year = ?, review = ? WHERE id = ? AND userUuid = ?`,
      [nextName, nextArtist, cover, ratingNum, releaseNum, normalizedReview, id, req.userUuid]
    );

    if (!updateResult || updateResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    await pool.execute(`DELETE FROM Tagged WHERE recordId = ?`, [id]);

    for (const tagName of tags || []) {
      let [tagRows] = await pool.execute(`SELECT id FROM Tag WHERE name = ? AND userUuid = ?`, [tagName, req.userUuid]);
      let tagId;
      if (tagRows.length === 0) {
        const [result] = await pool.execute(`INSERT INTO Tag (name, userUuid, created) VALUES (?, ?, UTC_TIMESTAMP())`, [tagName, req.userUuid]);
        tagId = result.insertId;
      } else {
        tagId = tagRows[0].id;
      }
      await pool.execute(`INSERT IGNORE INTO Tagged (recordId, tagId, created) VALUES (?, ?, UTC_TIMESTAMP())`, [id, tagId]);
    }

    const [rows] = await pool.execute(
      `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review FROM Record r WHERE r.id = ? AND r.userUuid = ?`,
      [id, req.userUuid]
    );

    const updated = rows[0];
    updated.review = normalizedReview;

    const [tagRows] = await pool.execute(
      `SELECT t.name FROM Tag t JOIN Tagged tg ON t.id = tg.tagId WHERE tg.recordId = ?`,
      [id]
    );
    updated.tags = tagRows.map((t) => t.name);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update record' });
  }
});

app.post('/api/records/create', requireAuth, async (req, res) => {
  console.log("Creating record...");
  const { record, artist, cover, rating, tags, release, tableName } = req.body;
  // Allow clients to omit the record name and provide a sensible default
  const DEFAULT_NEW_RECORD_NAME = 'New Record';
  if (!tableName || typeof tableName !== 'string') {
    return res.status(400).json({ error: 'tableName is required' });
  }
  const recordName = typeof record === 'string' ? record.trim() : '';
  const artistName = typeof artist === 'string' ? artist.trim() : '';

  // Validate release only if provided (allow null/default)
  let releaseNum = null;
  if (release !== undefined && release !== null && String(release).trim() !== '') {
    const parsed = Number(release);
    if (!Number.isInteger(parsed) || parsed < 1901 || parsed > 2100) {
      return res.status(400).json({ error: 'invalid release year' });
    }
    releaseNum = parsed;
    // MySQL YEAR type only accepts 1901-2155 (and 0000 in some modes).
    // If the provided year is outside the YEAR column supported range, prefer to store NULL
    // rather than attempt to insert an out-of-range value which causes SQL errors.
    if (releaseNum < 1901 || releaseNum > 2155) {
      releaseNum = null;
    }
  }

  // Validate rating only if provided
  let ratingNum = null;
  if (rating !== undefined && rating !== null && String(rating).trim() !== '') {
    const parsedRating = Number(rating);
    if (!Number.isInteger(parsedRating) || parsedRating < 0 || parsedRating > 10) {
      return res.status(400).json({ error: 'invalid rating' });
    }
    ratingNum = parsedRating;
  }

  let reviewText = null;
  if (typeof req.body?.review === "string") {
    const trimmed = req.body.review.trim();
    reviewText = trimmed.length > 0 ? trimmed.slice(0, 4000) : null;
  } else if (req.body?.review === null) {
    reviewText = null;
  }

  const rawIsCustom = req.body ? req.body.isCustom : undefined;
  const isCustom = rawIsCustom === true || rawIsCustom === 1 || rawIsCustom === "1";

  const masterIdRaw = req.body ? req.body.masterId : undefined;
  const masterId = Number(masterIdRaw);
  const hasMaster = Number.isInteger(masterId) && masterId > 0;

  let masterReleaseYear = null;
  if (hasMaster) {
    const masterReleaseRaw = req.body?.masterReleaseYear;
    const masterReleaseNum = Number(masterReleaseRaw);
    if (Number.isInteger(masterReleaseNum) && masterReleaseNum >= 1901 && masterReleaseNum <= 2100) {
      masterReleaseYear = masterReleaseNum;
    }
  }

  const masterCoverRaw = req.body?.masterCover;
  const masterCover = typeof masterCoverRaw === "string" && masterCoverRaw.trim() ? masterCoverRaw.trim() : null;
  const cleanCover = typeof cover === "string" && cover.trim() ? cover.trim() : null;

  try {
    const pool = await getPool();
    const tableId = await getUserTableId(pool, req.userUuid, tableName);
    if (!tableId) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    if (hasMaster) {
      const [existingRows] = await pool.execute(
        `SELECT r.id, r.name AS record, t.name AS collectionName
         FROM Record r
         JOIN RecTable t ON r.tableId = t.id
         WHERE r.userUuid = ? AND r.masterId = ?
         LIMIT 1`,
        [req.userUuid, masterId]
      );
      if (Array.isArray(existingRows) && existingRows.length > 0) {
        const match = existingRows[0];
        const conflictRecord = typeof match.record === 'string' ? match.record : 'that record';
        const conflictCollection = typeof match.collectionName === 'string' && match.collectionName.trim()
          ? match.collectionName.trim()
          : 'one of your collections';
        return res.status(409).json({
          error: `You already have "${conflictRecord}" in ${conflictCollection}.`,
          existingRecord: conflictRecord,
          existingCollection: conflictCollection,
          existingRecordId: match.id,
        });
      }
      const masterCoverValue = masterCover || cleanCover || null;
      await pool.execute(
        `INSERT INTO Master (id, artist, cover, name, release_year, created)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           artist = VALUES(artist),
           cover = CASE WHEN VALUES(cover) IS NOT NULL THEN VALUES(cover) ELSE cover END,
           name = VALUES(name),
           release_year = COALESCE(VALUES(release_year), release_year)`,
        [masterId, artistName, masterCoverValue, recordName, masterReleaseYear]
      );
    }

  const nameToInsert = recordName || DEFAULT_NEW_RECORD_NAME;
    const [result] = await pool.execute(
      `INSERT INTO Record (name, artist, cover, rating, release_year, tableId, userUuid, added, isCustom, masterId, review)
       VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?, ?, ?)`,
      [
        nameToInsert,
        artistName,
        cleanCover,
        ratingNum,
        releaseNum,
        tableId,
        req.userUuid,
        isCustom,
        hasMaster ? masterId : null,
        reviewText,
      ]
    );
    const newId = result.insertId;
    // Add tags (create if missing)
    for (const tagName of tags || []) {
      let [tagRows] = await pool.execute(`SELECT id FROM Tag WHERE name = ? AND userUuid = ?`, [tagName, req.userUuid]);
      let tagId;
      if (tagRows.length === 0) {
        const [tagResult] = await pool.execute(`INSERT INTO Tag (name, userUuid, created) VALUES (?, ?, UTC_TIMESTAMP())`, [tagName, req.userUuid]);
        tagId = tagResult.insertId;
      } else {
        tagId = tagRows[0].id;
      }
      await pool.execute(`INSERT IGNORE INTO Tagged (recordId, tagId, created) VALUES (?, ?, UTC_TIMESTAMP())`, [newId, tagId]);
    }
    // Return new record
    const [rows] = await pool.execute(
      `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review FROM Record r WHERE r.id = ? AND r.userUuid = ?`,
      [newId, req.userUuid]
    );
    const created = rows[0];
    created.review = reviewText;
    // Get tags
    const [tagRows] = await pool.execute(
      `SELECT t.name FROM Tag t JOIN Tagged tg ON t.id = tg.tagId WHERE tg.recordId = ?`,
      [newId]
    );
    created.tags = tagRows.map((t) => t.name);
    res.json(created);
  } catch (err) {
    console.error('Failed to create record', err);
    res.status(500).json({ error: 'Failed to create record' });
  }
});

// Tag management endpoints
app.post('/api/tags/create', requireAuth, async (req, res) => {
  console.log('Creating tag...');
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tag name required' });
  try {
    const pool = await getPool();
    const trimmed = name.trim();
    // Check duplicate
    const [existing] = await pool.execute(`SELECT id FROM Tag WHERE name = ? AND userUuid = ?`, [trimmed, req.userUuid]);
    if (existing.length > 0) return res.status(409).json({ error: 'Tag already exists' });
    await pool.execute(`INSERT INTO Tag (name, userUuid, created) VALUES (?, ?, UTC_TIMESTAMP())`, [trimmed, req.userUuid]);
    const [rows] = await pool.execute(`SELECT name FROM Tag WHERE userUuid = ? ORDER BY name`, [req.userUuid]);
    res.json({ tags: rows.map(r => r.name) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

app.post('/api/tags/rename', requireAuth, async (req, res) => {
  console.log('Renaming tag...');
  const { oldName, newName, tagId } = req.body;
  if (!newName) return res.status(400).json({ error: 'newName required' });
  try {
    const pool = await getPool();
    const trimmedNew = String(newName).trim();
    if (!trimmedNew) return res.status(400).json({ error: 'New name cannot be empty' });

    let targetId = null;

    if (tagId) {
      // Rename by id: ensure tag belongs to the user
      const [rows] = await pool.execute(`SELECT id FROM Tag WHERE id = ? AND userUuid = ? LIMIT 1`, [tagId, req.userUuid]);
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Tag not found' });
      targetId = rows[0].id;
    } else if (oldName) {
      // Back-compat: find the row by oldName
      const [oldRows] = await pool.execute(`SELECT id FROM Tag WHERE name = ? AND userUuid = ? LIMIT 1`, [oldName, req.userUuid]);
      if (!oldRows || oldRows.length === 0) return res.status(404).json({ error: 'Tag not found' });
      targetId = oldRows[0].id;
    } else {
      return res.status(400).json({ error: 'tagId or oldName required' });
    }

    // Check for a different tag with the desired new name. If the only match is the same row (same id), allow the rename
    const [dup] = await pool.execute(`SELECT id FROM Tag WHERE name = ? AND userUuid = ? LIMIT 1`, [trimmedNew, req.userUuid]);
    if (dup.length > 0 && dup[0].id !== targetId) {
      return res.status(409).json({ error: 'A tag with that name already exists' });
    }

    // Perform update by id to avoid ambiguity when name comparisons are case-insensitive
    const [result] = await pool.execute(`UPDATE Tag SET name = ? WHERE id = ? AND userUuid = ?`, [trimmedNew, targetId, req.userUuid]);
    if (result.affectedRows === 0) return res.status(500).json({ error: 'Failed to rename tag' });
    const [rows] = await pool.execute(`SELECT name FROM Tag WHERE userUuid = ? ORDER BY name`, [req.userUuid]);
    res.json({ tags: rows.map(r => r.name) });
  } catch (err) {
    console.error('Failed to rename tag', err);
    res.status(500).json({ error: 'Failed to rename tag' });
  }
});

app.post('/api/tags/delete', requireAuth, async (req, res) => {
  console.log('Deleting tag...');
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Tag name required' });
  try {
    const pool = await getPool();
    // Deleting the Tag row will cascade to Tagged via the DB's ON DELETE CASCADE.
    const [delResult] = await pool.execute(`DELETE FROM Tag WHERE name = ? AND userUuid = ?`, [name, req.userUuid]);
    if (!delResult || delResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    const [rows] = await pool.execute(`SELECT name FROM Tag WHERE userUuid = ? ORDER BY name`, [req.userUuid]);
    res.json({ tags: rows.map(r => r.name) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Delete a record
app.post('/api/records/delete', requireAuth, async (req, res) => {
  console.log('Deleting record...');
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  try {
    const pool = await getPool();
    // Single DELETE ensures we only remove a record owned by this user.
    const [result] = await pool.execute(`DELETE FROM Record WHERE id = ? AND userUuid = ?`, [id, req.userUuid]);
    // result is an OkPacket with affectedRows
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

app.post('/api/import/discogs', requireAuth, async (req, res) => {
  console.log('Importing Discogs collection...');
  const { records, tableName } = req.body || {};
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records array is required' });
  }
  const targetTable =
    typeof tableName === 'string' && tableName.trim()
      ? tableName.trim()
      : DEFAULT_COLLECTION_NAME;

  try {
    const pool = await getPool();
    const tableId = await getUserTableId(pool, req.userUuid, targetTable);
    if (!tableId) {
      return res.status(404).json({ error: `Collection '${targetTable}' not found` });
    }

    let created = 0;
    let skipped = 0;
    let withoutCover = 0;
    const tagCache = new Map();

    for (const raw of records) {
      if (!raw || typeof raw !== 'object') {
        skipped += 1;
        continue;
      }
      const recordName = typeof raw.record === 'string' ? raw.record.trim() : '';
      const artist = typeof raw.artist === 'string' ? raw.artist.trim() : '';
      if (!recordName || !artist) {
        skipped += 1;
        continue;
      }

      const releaseNum = Number.parseInt(raw.release, 10);
      let release = Number.isInteger(releaseNum) ? releaseNum : 1901;
      if (release < 1901 || release > 2100) {
        release = 1901;
      }

      const ratingNum = Number(raw.rating);
      let rating = Number.isFinite(ratingNum) ? Math.round(ratingNum) : 0;
      if (rating < 0) rating = 0;
      if (rating > 10) rating = 10;

  const dateVal = typeof raw.added === 'string' ? raw.added.trim() : '';
  const dateAdded = /^\d{4}-\d{2}-\d{2}$/.test(dateVal) ? dateVal : null;

      const tagsArray = Array.isArray(raw.tags) ? raw.tags : [];
      const cleanTags = Array.from(
        new Set(
          tagsArray
            .filter((tag) => typeof tag === 'string')
            .map((tag) => tag.trim())
            .filter(Boolean)
        )
      );

      const [existingRows] = await pool.execute(
        `SELECT id FROM Record WHERE userUuid = ? AND tableId = ? AND LOWER(name) = ? AND LOWER(artist) = ? LIMIT 1`,
        [req.userUuid, tableId, recordName.toLowerCase(), artist.toLowerCase()]
      );
      if (existingRows.length > 0) {
        skipped += 1;
        continue;
      }

      const cover = await fetchLastFmCover(artist, recordName);
      if (!cover) {
        withoutCover += 1;
      }

  const addedAtUtcRaw = dateAdded
    ? formatUtcDateTime(`${dateAdded}T00:00:00Z`)
    : formatUtcDateTime(new Date());
  const addedAtUtc = addedAtUtcRaw ?? formatUtcDateTime(new Date());
      const [insertResult] = await pool.execute(
        `INSERT INTO Record (name, artist, cover, rating, release_year, tableId, userUuid, added) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [recordName, artist, cover || null, rating, release, tableId, req.userUuid, addedAtUtc]
      );
      const newRecordId = insertResult.insertId;
      created += 1;

      for (const tagName of cleanTags) {
        const cacheKey = tagName.toLowerCase();
        let tagId = tagCache.get(cacheKey);
        if (!tagId) {
          const [tagRows] = await pool.execute(
            `SELECT id FROM Tag WHERE name = ? AND userUuid = ? LIMIT 1`,
            [tagName, req.userUuid]
          );
          if (tagRows.length > 0) {
            tagId = tagRows[0].id;
          } else {
            const [tagInsert] = await pool.execute(
              `INSERT INTO Tag (name, userUuid, created) VALUES (?, ?, UTC_TIMESTAMP())`,
              [tagName, req.userUuid]
            );
            tagId = tagInsert.insertId;
          }
          tagCache.set(cacheKey, tagId);
        }
        await pool.execute(
          `INSERT IGNORE INTO Tagged (recordId, tagId, created) VALUES (?, ?, UTC_TIMESTAMP())`,
          [newRecordId, tagId]
        );
      }
    }

    res.json({ success: true, created, skipped, withoutCover });
  } catch (err) {
    console.error('Discogs import failed', err);
    res.status(500).json({ error: 'Failed to import Discogs collection' });
  }
});

// Delete all records in a user's collection (table)
app.post('/api/records/clear', requireAuth, async (req, res) => {
  console.log('Clearing collection...');
  const { tableName } = req.body || {};
  const targetTable = typeof tableName === 'string' && tableName.trim() ? tableName.trim() : DEFAULT_COLLECTION_NAME;
  try {
    const pool = await getPool();
    const tableId = await getUserTableId(pool, req.userUuid, targetTable);
    if (!tableId) {
      return res.status(404).json({ error: `Collection '${targetTable}' not found` });
    }
    const [result] = await pool.execute(`DELETE FROM Record WHERE userUuid = ? AND tableId = ?`, [req.userUuid, tableId]);
    const deleted = result.affectedRows || 0;
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('Failed to clear collection', err);
    res.status(500).json({ error: 'Failed to clear collection' });
  }
});

// Delete all tags for the user (and associated Tagged rows)
app.post('/api/tags/clear', requireAuth, async (req, res) => {
  console.log('Clearing all tags...');
  try {
    const pool = await getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Count how many Tagged rows will be removed when we delete the user's tags
      const [countRows] = await conn.execute(
        `SELECT COUNT(tgd.recordId) AS cnt FROM Tagged tgd JOIN Tag tg ON tgd.tagId = tg.id WHERE tg.userUuid = ?`,
        [req.userUuid]
      );
      const taggedDeleted = (countRows && countRows[0] && countRows[0].cnt) ? Number(countRows[0].cnt) : 0;
      const [tagDel] = await conn.execute(`DELETE FROM Tag WHERE userUuid = ?`, [req.userUuid]);
      const tagsDeleted = tagDel.affectedRows || 0;
      await conn.commit();
      res.json({ success: true, tagsDeleted, taggedDeleted });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Failed to clear tags', err);
    res.status(500).json({ error: 'Failed to clear tags' });
  }
});

// Proxy to Last.fm album.search (requires LASTFM_API_KEY in env)
app.get('/api/lastfm/album.search', async (req, res) => {
  const { q, page } = req.query;
  console.log("Last.fm album.search for query:", q, "and page:", page);
  if (!q || typeof q !== 'string') return res.status(400).json({ error: 'Missing q param' });
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing LASTFM_API_KEY on server' });
  
  const pageNum = typeof page === 'string' && /^\d+$/.test(page) ? parseInt(page, 10) : 1;
  const limit = 5;
  
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=album.search&album=${encodeURIComponent(q)}&api_key=${apiKey}&format=json&limit=${limit}&page=${pageNum}`;
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text();
      console.error('Last.fm upstream error', r.status, body);
      return res.status(502).json({ error: 'Last.fm upstream failure', status: r.status });
    }
    const data = await r.json();
    
    // Extract only necessary fields
    const albums = data?.results?.albummatches?.album || [];
    const transformedAlbums = Array.isArray(albums) ? albums.map(album => {
      // Get the largest available image
      const images = Array.isArray(album.image) ? album.image : [];
      const largeImage = images.find(img => img.size === 'extralarge') || images.find(img => img.size === 'large') || images.find(img => img.size === 'medium') || {};
      
      return {
        name: album.name || '',
        artist: album.artist || '',
        image: largeImage['#text'] || null
      };
    }) : [];
    
    const totalResults = parseInt(data?.results?.['opensearch:totalResults'] || '0', 10);
    const startIndex = parseInt(data?.results?.['opensearch:startIndex'] || '0', 10);
    const itemsPerPage = parseInt(data?.results?.['opensearch:itemsPerPage'] || '0', 10);
    
    res.json({
      albums: transformedAlbums,
      totalResults,
      currentPage: pageNum,
      itemsPerPage,
      hasMore: startIndex + itemsPerPage < totalResults
    });
  } catch (err) {
    console.error('Last.fm proxy error', err);
    res.status(500).json({ error: 'Failed to query Last.fm' });
  }
});

app.get('/api/preferences/record-table', requireAuth, async (req, res) => {
  console.log('Fetching record table preferences...');
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(
      `SELECT recordTablePrefs FROM UserSettings WHERE userUuid = ? LIMIT 1`,
      [req.userUuid]
    );
    if (rows.length === 0 || !rows[0].recordTablePrefs) {
      return res.json(createDefaultRecordTablePreferences());
    }

    let stored = rows[0].recordTablePrefs;
    if (typeof stored === "string") {
      try {
        stored = JSON.parse(stored);
      } catch {
        stored = null;
      }
    }

    const normalized = normalizeRecordTablePreferences(stored);
    res.json(normalized);
  } catch (err) {
    console.error('Failed to fetch record table preferences', err);
    res.status(500).json({ error: 'Failed to fetch record table preferences' });
  }
});

app.post('/api/preferences/record-table', requireAuth, async (req, res) => {
  console.log('Saving record table preferences...');
  try {
    const normalized = normalizeRecordTablePreferences(req.body || {});
    const pool = await getPool();
    await pool.execute(
      `INSERT INTO UserSettings (userUuid, recordTablePrefs)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE recordTablePrefs = VALUES(recordTablePrefs)`,
      [req.userUuid, JSON.stringify(normalized)]
    );
    res.json({ success: true, preferences: normalized });
  } catch (err) {
    console.error('Failed to save record table preferences', err);
    res.status(500).json({ error: 'Failed to save record table preferences' });
  }
});

app.get('/api/profile/highlights', requireAuth, async (req, res) => {
  console.log('Fetching profile highlights...');
  try {
    const pool = await getPool();
    const highlightIds = await getProfileHighlightIds(pool, req.userUuid);
    if (highlightIds.length === 0) {
      return res.json({ recordIds: [], records: [] });
    }

    const records = await fetchRecordsWithTagsByIds(pool, req.userUuid, highlightIds);
    const foundIds = records.map((r) => r.id);
    if (foundIds.length !== highlightIds.length) {
      // Persist cleaned list without missing records
      await pool.execute(
        `INSERT INTO UserSettings (userUuid, recordTablePrefs, profileHighlights)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE profileHighlights = VALUES(profileHighlights)`,
        [
          req.userUuid,
          JSON.stringify(createDefaultRecordTablePreferences()),
          JSON.stringify(foundIds),
        ]
      );
    }

    res.json({ recordIds: foundIds, records });
  } catch (err) {
    console.error('Failed to fetch profile highlights', err);
    res.status(500).json({ error: 'Failed to fetch profile highlights' });
  }
});

app.post('/api/profile/highlights', requireAuth, async (req, res) => {
  console.log('Updating profile highlights...');
  try {
    const rawIds = Array.isArray(req.body?.recordIds) ? req.body.recordIds : [];
    const normalizedIds = normalizeProfileHighlightIds(rawIds);

    const pool = await getPool();
    if (normalizedIds.length > 0) {
      const placeholders = normalizedIds.map(() => '?').join(', ');
      const params = [req.userUuid, ...normalizedIds];
      const [rows] = await pool.query(
        `SELECT id FROM Record WHERE userUuid = ? AND id IN (${placeholders})`,
        params
      );
      const foundIds = new Set(rows.map((row) => row.id));
      const missing = normalizedIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return res.status(400).json({ error: 'One or more records are invalid' });
      }
    }

    await pool.execute(
      `INSERT INTO UserSettings (userUuid, recordTablePrefs, profileHighlights)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE profileHighlights = VALUES(profileHighlights)`,
      [
        req.userUuid,
        JSON.stringify(createDefaultRecordTablePreferences()),
        JSON.stringify(normalizedIds),
      ]
    );

    res.json({ success: true, recordIds: normalizedIds });
  } catch (err) {
    console.error('Failed to update profile highlights', err);
    res.status(500).json({ error: 'Failed to update profile highlights' });
  }
});

// List user's collections (RecTable names)
app.get('/api/collections', requireAuth, async (req, res) => {
  console.log('Listing collections...');
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(`SELECT name FROM RecTable WHERE userUuid = ? ORDER BY name`, [req.userUuid]);
    res.json({ collections: rows.map(r => r.name) });
  } catch (err) {
    console.error('Failed to list collections', err);
    res.status(500).json({ error: 'Failed to list collections' });
  }
});

app.get('/api/collections/privacy', requireAuth, async (req, res) => {
  console.log('Fetching collection privacy state...');
  try {
    const pool = await getPool();
    const [collectionRow, wishlistRow, listenedRow] = await Promise.all([
      getUserTableRow(pool, req.userUuid, DEFAULT_COLLECTION_NAME),
      getUserTableRow(pool, req.userUuid, WISHLIST_COLLECTION_NAME),
      getUserTableRow(pool, req.userUuid, LISTENED_COLLECTION_NAME),
    ]);

    if (!collectionRow) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const collectionPrivacy = {
      tableName: collectionRow.name,
      isPrivate: Number(collectionRow.isPrivate) === 1,
    };

    const wishlistPrivacy = wishlistRow
      ? {
          tableName: wishlistRow.name,
          isPrivate: Number(wishlistRow.isPrivate) === 1,
        }
      : {
          tableName: WISHLIST_COLLECTION_NAME,
          isPrivate: true,
        };

    const listenedPrivacy = listenedRow
      ? {
          tableName: listenedRow.name,
          isPrivate: Number(listenedRow.isPrivate) === 1,
        }
      : {
          tableName: LISTENED_COLLECTION_NAME,
          isPrivate: false,
        };

    res.json({
      collection: collectionPrivacy,
      wishlist: wishlistPrivacy,
      listened: listenedPrivacy,
    });
  } catch (err) {
    console.error('Failed to fetch collection privacy state', err);
    res.status(500).json({ error: 'Failed to fetch collection privacy state' });
  }
});

app.post('/api/collections/privacy', requireAuth, async (req, res) => {
  console.log('Updating collection privacy state...');
  const { tableName: rawTableName, isPrivate } = req.body || {};
  if (typeof isPrivate !== 'boolean') {
    return res.status(400).json({ error: 'isPrivate (boolean) is required' });
  }
  const tableName =
    typeof rawTableName === 'string' && rawTableName.trim()
      ? rawTableName.trim()
      : DEFAULT_COLLECTION_NAME;
  try {
    const pool = await getPool();
    const tableRow = await getUserTableRow(pool, req.userUuid, tableName);
    if (!tableRow) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    await pool.execute(
      `UPDATE RecTable SET isPrivate = ? WHERE id = ? AND userUuid = ?`,
      [isPrivate ? 1 : 0, tableRow.id, req.userUuid]
    );
    res.json({ success: true, tableName: tableRow.name, isPrivate });
  } catch (err) {
    console.error('Failed to update collection privacy', err);
    res.status(500).json({ error: 'Failed to update collection privacy' });
  }
});

// Move a record to a different collection (RecTable)
app.post('/api/records/move', requireAuth, async (req, res) => {
  console.log('Moving record to different collection...');
  const { id, targetTableName } = req.body || {};
  if (!id || !targetTableName || typeof targetTableName !== 'string') {
    return res.status(400).json({ error: 'id and targetTableName required' });
  }
  try {
    const pool = await getPool();
    // Fetch current record to ensure ownership and get its current tableId
    const [currentRows] = await pool.execute(
      `SELECT id, tableId, name as record, artist FROM Record WHERE id = ? AND userUuid = ? LIMIT 1`,
      [id, req.userUuid]
    );
    if (currentRows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    // Resolve destination table id
    const destTableId = await getUserTableId(pool, req.userUuid, targetTableName.trim());
    if (!destTableId) {
      return res.status(404).json({ error: 'Destination collection not found' });
    }
    if (destTableId === currentRows[0].tableId) {
      return res.status(400).json({ error: 'Record is already in that collection' });
    }
    const [updateResult] = await pool.execute(
      `UPDATE Record SET tableId = ?, added = UTC_TIMESTAMP() WHERE id = ? AND userUuid = ?`,
      [destTableId, id, req.userUuid]
    );
    if (!updateResult || updateResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Failed to move record' });
    }
    // Return minimal info; client can remove from current list
    res.json({ success: true, message: `Moved record to '${targetTableName}'`, recordId: id, targetTableName });
  } catch (err) {
    console.error('Failed to move record', err);
    res.status(500).json({ error: 'Failed to move record' });
  }
});

// List management endpoints
app.get('/api/lists/mine', requireAuth, async (req, res) => {
  console.log('Fetching user lists...');
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 50;
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT l.id, l.name, l.description, l.isPrivate, l.likes, l.picture, l.created,
              COALESCE(stats.recordCount, 0) AS recordCount
         FROM List l
         LEFT JOIN (
           SELECT listId, COUNT(*) AS recordCount FROM ListRecord GROUP BY listId
         ) stats ON stats.listId = l.id
        WHERE l.userUuid = ?
        ORDER BY l.created DESC
        LIMIT ? OFFSET ?`,
      [req.userUuid, limit, offset]
    );
    const lists = Array.isArray(rows) ? rows.map(mapListSummaryRow) : [];
    res.json({ lists, limit, offset });
  } catch (err) {
    console.error('Failed to fetch lists', err);
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

app.post('/api/lists', requireAuth, listPicUpload.single('picture'), async (req, res) => {
  console.log('Creating list...');
  const uploadedFilename = req.file?.filename ?? null;
  const uploadedRelativePath = uploadedFilename ? buildListPicRelativePath(uploadedFilename) : null;
  const cleanupUploadedPicture = async () => {
    if (!uploadedRelativePath) return;
    try {
      await deleteListPicFile(uploadedRelativePath);
    } catch (cleanupErr) {
      console.warn('Failed to clean up uploaded list picture', cleanupErr);
    }
  };
  const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!rawName) {
    await cleanupUploadedPicture();
    return res.status(400).json({ error: 'name is required' });
  }
  if (rawName.length > 50) {
    await cleanupUploadedPicture();
    return res.status(400).json({ error: 'name must be 50 characters or fewer' });
  }
  const rawDescription = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const description = rawDescription ? rawDescription.slice(0, 1000) : null;
  const isPrivateInput = req.body?.isPrivate;
  const isPrivate =
    isPrivateInput === true ||
    isPrivateInput === 'true' ||
    isPrivateInput === '1' ||
    Number(isPrivateInput) === 1;

  let listCreated = false;

  try {
    const pool = await getPool();
    const [result] = await pool.execute(
      `INSERT INTO List (name, userUuid, isPrivate, likes, picture, description, created)
       VALUES (?, ?, ?, 0, ?, ?, UTC_TIMESTAMP())`,
      [rawName, req.userUuid, isPrivate ? 1 : 0, uploadedRelativePath, description]
    );
    const listId = Number(result?.insertId);
    if (Number.isInteger(listId) && listId > 0) {
      listCreated = true;
    }
    const [rows] = await pool.query(
      `SELECT l.id, l.name, l.description, l.isPrivate, l.likes, l.picture, l.created,
              COALESCE(stats.recordCount, 0) AS recordCount
         FROM List l
         LEFT JOIN (
           SELECT listId, COUNT(*) AS recordCount FROM ListRecord GROUP BY listId
         ) stats ON stats.listId = l.id
        WHERE l.id = ? AND l.userUuid = ?
        LIMIT 1`,
      [listId, req.userUuid]
    );
    const listRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!listRow) {
      return res.status(201).json({ list: null });
    }
    res.status(201).json({ list: mapListSummaryRow(listRow) });
  } catch (err) {
    console.error('Failed to create list', err);
    if (!listCreated) {
      await cleanupUploadedPicture();
    }
    res.status(500).json({ error: 'Failed to create list' });
  }
});

app.patch('/api/lists/:listId', requireAuth, async (req, res) => {
  console.log('Updating list...');
  const listId = Number(req.params.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'Invalid list id' });
  }

  const updates = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'name')) {
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!rawName) {
      return res.status(400).json({ error: 'name cannot be empty' });
    }
    if (rawName.length > 50) {
      return res.status(400).json({ error: 'name must be 50 characters or fewer' });
    }
    updates.push('name = ?');
    params.push(rawName);
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'description')) {
    if (req.body?.description === null) {
      updates.push('description = NULL');
    } else {
      const rawDescription =
        typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      updates.push('description = ?');
      params.push(rawDescription ? rawDescription.slice(0, 1000) : null);
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'isPrivate')) {
    const nextPrivate = req.body?.isPrivate === true ? 1 : 0;
    updates.push('isPrivate = ?');
    params.push(nextPrivate);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No updates specified' });
  }

  try {
    const pool = await getPool();
    const [result] = await pool.execute(
      `UPDATE List SET ${updates.join(', ')} WHERE id = ? AND userUuid = ?`,
      [...params, listId, req.userUuid]
    );
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'List not found' });
    }
    const [rows] = await pool.query(
      `SELECT l.id, l.name, l.description, l.isPrivate, l.likes, l.picture, l.created,
              COALESCE(stats.recordCount, 0) AS recordCount
         FROM List l
         LEFT JOIN (
           SELECT listId, COUNT(*) AS recordCount FROM ListRecord GROUP BY listId
         ) stats ON stats.listId = l.id
        WHERE l.id = ? AND l.userUuid = ?
        LIMIT 1`,
      [listId, req.userUuid]
    );
    const listRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    res.json({ list: listRow ? mapListSummaryRow(listRow) : null });
  } catch (err) {
    console.error('Failed to update list', err);
    res.status(500).json({ error: 'Failed to update list' });
  }
});

app.delete('/api/lists/:listId', requireAuth, async (req, res) => {
  console.log('Deleting list...');
  const listId = Number(req.params.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'Invalid list id' });
  }
  try {
    const pool = await getPool();
    const listRow = await getOwnedListById(pool, listId, req.userUuid);
    if (!listRow) {
      return res.status(404).json({ error: 'List not found' });
    }
    const picturePath = typeof listRow.picture === 'string' ? listRow.picture : null;
    const [result] = await pool.execute(
      `DELETE FROM List WHERE id = ? AND userUuid = ?`,
      [listId, req.userUuid]
    );
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'List not found' });
    }
    await deleteListPicFile(picturePath);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete list', err);
    res.status(500).json({ error: 'Failed to delete list' });
  }
});

app.post('/api/lists/:listId/picture', requireAuth, listPicUpload.single('picture'), async (req, res) => {
  console.log('Updating list picture...');
  const listId = Number(req.params.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'Invalid list id' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'picture file is required' });
  }
  try {
    const pool = await getPool();
    const listRow = await getOwnedListById(pool, listId, req.userUuid);
    if (!listRow) {
      await deleteListPicFile(buildListPicRelativePath(req.file.filename));
      return res.status(404).json({ error: 'List not found' });
    }
    const newRelativePath = buildListPicRelativePath(req.file.filename);
    const previousPath = typeof listRow.picture === 'string' ? listRow.picture : null;
    await pool.execute(
      `UPDATE List SET picture = ? WHERE id = ? AND userUuid = ?`,
      [newRelativePath, listId, req.userUuid]
    );
    if (previousPath) {
      await deleteListPicFile(previousPath);
    }
    const [rows] = await pool.query(
      `SELECT l.id, l.name, l.description, l.isPrivate, l.likes, l.picture, l.created,
              COALESCE(stats.recordCount, 0) AS recordCount
         FROM List l
         LEFT JOIN (
           SELECT listId, COUNT(*) AS recordCount FROM ListRecord GROUP BY listId
         ) stats ON stats.listId = l.id
        WHERE l.id = ? AND l.userUuid = ?
        LIMIT 1`,
      [listId, req.userUuid]
    );
    const updatedRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    res.json({ list: updatedRow ? mapListSummaryRow(updatedRow) : null });
  } catch (err) {
    console.error('Failed to update list picture', err);
    res.status(500).json({ error: 'Failed to update list picture' });
  }
});

app.delete('/api/lists/:listId/picture', requireAuth, async (req, res) => {
  console.log('Removing list picture...');
  const listId = Number(req.params.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'Invalid list id' });
  }
  try {
    const pool = await getPool();
    const listRow = await getOwnedListById(pool, listId, req.userUuid);
    if (!listRow) {
      return res.status(404).json({ error: 'List not found' });
    }
    const picturePath = typeof listRow.picture === 'string' ? listRow.picture : null;
    if (!picturePath) {
      return res.json({ success: true });
    }
    await pool.execute(
      `UPDATE List SET picture = NULL WHERE id = ? AND userUuid = ?`,
      [listId, req.userUuid]
    );
    await deleteListPicFile(picturePath);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to remove list picture', err);
    res.status(500).json({ error: 'Failed to remove list picture' });
  }
});

app.get('/api/lists/search', async (req, res) => {
  console.log('Searching public lists...');
  const limitRaw = Number(req.query.limit);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;
  const offsetRaw = Number(req.query.offset);
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (rawQuery.length < 2) {
    return res.json({ lists: [], limit, offset: 0 });
  }

  try {
    const currentUserUuid = extractUserUuidFromRequest(req);
    const pool = await getPool();
    const likeTerm = `%${escapeForLike(rawQuery)}%`;
    const [rows] = await pool.query(
      `SELECT l.id, l.name, l.description, l.isPrivate, l.likes, l.picture, l.created,
              COALESCE(stats.recordCount, 0) AS recordCount,
              u.username, u.displayName, u.profilePic,
              CASE WHEN ll.userUuid IS NULL THEN 0 ELSE 1 END AS likedByCurrentUser
         FROM List l
         JOIN User u ON u.uuid = l.userUuid
         LEFT JOIN (
           SELECT listId, COUNT(*) AS recordCount FROM ListRecord GROUP BY listId
         ) stats ON stats.listId = l.id
         LEFT JOIN ListLike ll ON ll.listId = l.id AND ll.userUuid = ?
        WHERE l.isPrivate = 0
          AND COALESCE(stats.recordCount, 0) > 0
          AND (l.name LIKE ? OR l.description LIKE ?)
        ORDER BY l.likes DESC, l.created DESC
        LIMIT ? OFFSET ?`,
      [currentUserUuid, likeTerm, likeTerm, limit, offset]
    );
    const lists = Array.isArray(rows) ? rows.map(mapListSummaryWithOwner) : [];
    res.json({ lists, limit, offset });
  } catch (err) {
    console.error('Failed to search lists', err);
    res.status(500).json({ error: 'Failed to search lists' });
  }
});

app.get('/api/lists/popular', async (req, res) => {
  console.log('Fetching popular lists...');
  try {
    const currentUserUuid = extractUserUuidFromRequest(req);
    const limitRaw = Number(req.query.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 12;
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT l.id, l.name, l.description, l.isPrivate, l.likes, l.picture, l.created,
              COALESCE(stats.recordCount, 0) AS recordCount,
              u.username, u.displayName, u.profilePic,
              CASE WHEN ll.userUuid IS NULL THEN 0 ELSE 1 END AS likedByCurrentUser
         FROM List l
         JOIN User u ON u.uuid = l.userUuid
         LEFT JOIN (
           SELECT listId, COUNT(*) AS recordCount FROM ListRecord GROUP BY listId
         ) stats ON stats.listId = l.id
         LEFT JOIN ListLike ll ON ll.listId = l.id AND ll.userUuid = ?
        WHERE l.isPrivate = 0
        ORDER BY l.likes DESC, l.created DESC
        LIMIT ? OFFSET ?`,
      [currentUserUuid, limit, offset]
    );
    const lists = Array.isArray(rows) ? rows.map(mapListSummaryWithOwner) : [];
    res.json({ lists, limit, offset });
  } catch (err) {
    console.error('Failed to fetch popular lists', err);
    res.status(500).json({ error: 'Failed to fetch popular lists' });
  }
});

app.get('/api/lists/:listId', async (req, res) => {
  const listId = Number(req.params.listId);
  console.log('Fetching list detail...', listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'Invalid list id' });
  }
  try {
    const currentUserUuid = extractUserUuidFromRequest(req);
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT l.id, l.name, l.description, l.isPrivate, l.likes, l.picture, l.created,
              l.userUuid,
              COALESCE(stats.recordCount, 0) AS recordCount,
              u.username, u.displayName, u.profilePic,
              CASE WHEN ll.userUuid IS NULL THEN 0 ELSE 1 END AS likedByCurrentUser
         FROM List l
         JOIN User u ON u.uuid = l.userUuid
         LEFT JOIN (
           SELECT listId, COUNT(*) AS recordCount FROM ListRecord GROUP BY listId
         ) stats ON stats.listId = l.id
         LEFT JOIN ListLike ll ON ll.listId = l.id AND ll.userUuid = ?
        WHERE l.id = ?
        LIMIT 1`,
      [currentUserUuid, listId]
    );
    const listRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!listRow) {
      return res.status(404).json({ error: 'List not found' });
    }
    const isOwner = currentUserUuid && listRow.userUuid === currentUserUuid;
    if (Number(listRow.isPrivate) === 1 && !isOwner) {
      return res.status(404).json({ error: 'List not found' });
    }
    const [recordRows] = await pool.query(
      `SELECT id, added, artist, cover, name, rating, release_year AS releaseYear,
              masterId, sortOrder
         FROM ListRecord
        WHERE listId = ?
        ORDER BY sortOrder ASC, added DESC` ,
      [listId]
    );
    const records = Array.isArray(recordRows) ? recordRows.map(mapListRecordRow) : [];
    const summary = mapListSummaryWithOwner(listRow);
    const responseList = {
      ...summary,
      isOwner: Boolean(isOwner),
      recordCount: records.length,
    };
    res.json({ list: responseList, records });
  } catch (err) {
    console.error('Failed to fetch list detail', err);
    res.status(500).json({ error: 'Failed to fetch list detail' });
  }
});

app.post('/api/lists/:listId/records', requireAuth, async (req, res) => {
  const listId = Number(req.params.listId);
  console.log('Adding record to list...', listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'Invalid list id' });
  }
  const masterIdRaw = Number(req.body?.masterId);
  const masterId = Number.isInteger(masterIdRaw) && masterIdRaw > 0 ? masterIdRaw : null;
  const recordNameRaw = typeof req.body?.recordName === 'string' ? req.body.recordName.trim() : '';
  const artistRaw = typeof req.body?.artist === 'string' ? req.body.artist.trim() : '';
  let recordName = recordNameRaw;
  let artist = artistRaw || null;
  let cover =
    typeof req.body?.cover === 'string' && req.body.cover.trim() ? req.body.cover.trim() : null;
  let releaseYearValue = Number(req.body?.releaseYear);
  let ratingValue = Number(req.body?.rating);
  const review =
    typeof req.body?.review === 'string' && req.body.review.trim()
      ? req.body.review.trim()
      : null;
  
  // Allow optional sortOrder for undo operations
  const requestedSortOrder = Number(req.body?.sortOrder);
  const hasSortOrder = Number.isInteger(requestedSortOrder) && requestedSortOrder > 0;

  if (!recordName && masterId === null) {
    return res.status(400).json({ error: 'recordName is required when masterId is not provided' });
  }

  if (Number.isFinite(releaseYearValue)) {
    releaseYearValue = Math.trunc(releaseYearValue);
    if (releaseYearValue < 1000 || releaseYearValue > 9999) {
      releaseYearValue = null;
    }
  } else {
    releaseYearValue = null;
  }

  if (Number.isFinite(ratingValue)) {
    ratingValue = Math.trunc(ratingValue);
    if (ratingValue < 0 || ratingValue > 10) {
      ratingValue = null;
    }
  } else {
    ratingValue = null;
  }

  try {
    const pool = await getPool();
    const listRow = await getOwnedListById(pool, listId, req.userUuid);
    if (!listRow) {
      return res.status(404).json({ error: 'List not found' });
    }

    if (masterId) {
      const [masterRows] = await pool.query(
        `SELECT name, artist, cover, release_year FROM Master WHERE id = ? LIMIT 1`,
        [masterId]
      );
      
      if (!Array.isArray(masterRows) || masterRows.length === 0) {
        // Master doesn't exist - fetch from Discogs and create it
        console.log(`Master ${masterId} not found in database, fetching from Discogs...`);
        try {
          const discogsResponse = await fetch(
            `https://api.discogs.com/masters/${masterId}`,
            {
              headers: {
                'User-Agent': process.env.DISCOGS_USER_AGENT || 'MyRecordCollection/2.0',
                'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN}`,
              },
            }
          );

          if (discogsResponse.ok) {
            const discogsData = await discogsResponse.json();
            const discogsName = typeof discogsData.title === 'string' ? discogsData.title : '';
            const discogsArtist = 
              Array.isArray(discogsData.artists) && discogsData.artists.length > 0 
                ? discogsData.artists[0].name 
                : '';
            const discogsCover = 
              typeof discogsData.images?.[0]?.uri === 'string' 
                ? discogsData.images[0].uri 
                : null;
            const discogsYear = Number(discogsData.year);
            const discogsReleaseYear = Number.isInteger(discogsYear) ? discogsYear : null;

            // Insert the master into the database
            await pool.execute(
              `INSERT INTO Master (id, name, artist, cover, release_year) VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE name = VALUES(name), artist = VALUES(artist), cover = VALUES(cover), release_year = VALUES(release_year)`,
              [masterId, discogsName, discogsArtist, discogsCover, discogsReleaseYear]
            );

            // Use the Discogs data for this request
            if (!recordName) {
              recordName = discogsName;
            }
            if (!artist) {
              artist = discogsArtist;
            }
            if (!cover) {
              cover = discogsCover;
            }
            if (releaseYearValue === null && discogsReleaseYear !== null) {
              releaseYearValue = discogsReleaseYear;
            }
          } else {
            console.error(`Failed to fetch master ${masterId} from Discogs:`, discogsResponse.status);
            return res.status(404).json({ error: 'Master not found in database or Discogs' });
          }
        } catch (error) {
          console.error(`Error fetching master ${masterId} from Discogs:`, error);
          return res.status(502).json({ error: 'Failed to fetch master information from Discogs' });
        }
      } else {
        // Master exists in database - use its data
        const masterRow = masterRows[0];
        if (!recordName) {
          recordName = typeof masterRow.name === 'string' ? masterRow.name : '';
        }
        if (!artist) {
          artist =
            typeof masterRow.artist === 'string' && masterRow.artist.trim()
              ? masterRow.artist.trim()
              : null;
        }
        if (!cover) {
          cover =
            typeof masterRow.cover === 'string' && masterRow.cover.trim()
              ? masterRow.cover.trim()
              : null;
        }
        if (releaseYearValue === null && masterRow.release_year != null) {
          const parsed = Number(masterRow.release_year);
          if (Number.isInteger(parsed)) {
            releaseYearValue = parsed;
          }
        }
      }
    }

    recordName = recordName || 'Untitled';

    // Use provided sortOrder if available (for undo operations), otherwise get the next available
    let sortOrderToUse;
    if (hasSortOrder) {
      sortOrderToUse = requestedSortOrder;
    } else {
      // Get the next sortOrder value (max + 1, or 1 if list is empty)
      const [sortOrderRows] = await pool.query(
        'SELECT COALESCE(MAX(sortOrder), 0) + 1 AS nextOrder FROM ListRecord WHERE listId = ?',
        [listId]
      );
      sortOrderToUse = sortOrderRows?.[0]?.nextOrder || 1;
    }

    const [result] = await pool.execute(
      `INSERT INTO ListRecord (added, artist, cover, name, rating, release_year, userUuid, listId, masterId, sortOrder)
       VALUES (UTC_TIMESTAMP(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        artist,
        cover,
        recordName,
        ratingValue,
        releaseYearValue,
        req.userUuid,
        listId,
        masterId,
        sortOrderToUse,
      ]
    );

    const newId = Number(result?.insertId);
    const [rows] = await pool.query(
      `SELECT id, added, artist, cover, name, rating, release_year AS releaseYear, masterId, sortOrder
         FROM ListRecord
        WHERE id = ? AND listId = ? AND userUuid = ?
        LIMIT 1`,
      [newId, listId, req.userUuid]
    );
    const recordRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    res.status(201).json({ record: recordRow ? mapListRecordRow(recordRow) : null });
  } catch (err) {
    console.error('Failed to add record to list', err);
    res.status(500).json({ error: 'Failed to add record to list' });
  }
});

app.delete('/api/lists/:listId/records/:recordId', requireAuth, async (req, res) => {
  const listId = Number(req.params.listId);
  const recordId = Number(req.params.recordId);
  console.log('Removing record', recordId, 'from list', listId);
  if (!Number.isInteger(listId) || listId <= 0 || !Number.isInteger(recordId) || recordId <= 0) {
    return res.status(400).json({ error: 'Invalid identifiers' });
  }
  try {
    const pool = await getPool();
    const listRow = await getOwnedListById(pool, listId, req.userUuid);
    if (!listRow) {
      return res.status(404).json({ error: 'List not found' });
    }
    const [result] = await pool.execute(
      `DELETE FROM ListRecord WHERE id = ? AND listId = ? AND userUuid = ?`,
      [recordId, listId, req.userUuid]
    );
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found in list' });
    }
    res.json({ success: true, recordId });
  } catch (err) {
    console.error('Failed to remove record from list', err);
    res.status(500).json({ error: 'Failed to remove record from list' });
  }
});

// IMPORTANT: This route must come BEFORE app.put('/api/lists/:listId/records/:recordId')
// so that 'reorder' doesn't get matched as :recordId
app.put('/api/lists/:listId/records/reorder', requireAuth, async (req, res) => {
  console.log('Reordering list records...');
  const listId = Number(req.params.listId);
  
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'Invalid list id' });
  }
  
  // Expect an array of { id, sortOrder } objects
  const updates = req.body?.updates;
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'Invalid updates array' });
  }

  let connection;
  try {
    const pool = await getPool();
    connection = await pool.getConnection();
    
    // Verify the user owns this list
    const [listRows] = await connection.query(
      'SELECT userUuid FROM List WHERE id = ?',
      [listId]
    );
    
    if (!Array.isArray(listRows) || listRows.length === 0 || listRows[0].userUuid !== req.userUuid) {
      return res.status(404).json({ error: 'List not found or access denied' });
    }

    await connection.beginTransaction();

    // Update sortOrder for each record
    for (const update of updates) {
      const recordId = Number(update.id);
      const sortOrder = Number(update.sortOrder);
      
      if (!Number.isInteger(recordId) || !Number.isInteger(sortOrder)) {
        await connection.rollback();
        return res.status(400).json({ error: 'Invalid record id or sortOrder' });
      }

      const [result] = await connection.execute(
        'UPDATE ListRecord SET sortOrder = ? WHERE id = ? AND listId = ?',
        [sortOrder, recordId, listId]
      );
    }

    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    if (connection) {
      await connection.rollback();
    }
    res.status(500).json({ error: 'Failed to reorder list records' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.put('/api/lists/:listId/records/:recordId', requireAuth, async (req, res) => {
  console.log('Updating list record...');
  const listId = Number(req.params.listId);
  const recordId = Number(req.params.recordId);
  if (!Number.isInteger(listId) || listId <= 0 || !Number.isInteger(recordId) || recordId <= 0) {
    return res.status(400).json({ error: 'Invalid identifiers' });
  }

  try {
    const pool = await getPool();
    const listRow = await getOwnedListById(pool, listId, req.userUuid);
    if (!listRow) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Extract and validate fields
    let releaseYear = Number(req.body?.releaseYear);
    if (!Number.isFinite(releaseYear)) {
      releaseYear = null;
    } else {
      releaseYear = Math.trunc(releaseYear);
      if (releaseYear < 1901 || releaseYear > 2100) {
        releaseYear = null;
      }
    }

    let rating = Number(req.body?.rating);
    if (!Number.isFinite(rating)) {
      rating = null;
    } else {
      rating = Math.trunc(rating);
      if (rating < 0 || rating > 10) {
        rating = null;
      }
    }

    let cover = typeof req.body?.cover === 'string' && req.body.cover.trim() 
      ? req.body.cover.trim() 
      : null;

    // Update the record
    const [result] = await pool.execute(
      `UPDATE ListRecord 
       SET release_year = ?, rating = ?, cover = ?
       WHERE id = ? AND listId = ? AND userUuid = ?`,
      [releaseYear, rating, cover, recordId, listId, req.userUuid]
    );

    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found in list' });
    }

    // Fetch and return the updated record
    const [rows] = await pool.query(
      `SELECT id, name, artist, cover, rating, release_year AS releaseYear, masterId, added, sortOrder
       FROM ListRecord
       WHERE id = ? AND listId = ? AND userUuid = ?
       LIMIT 1`,
      [recordId, listId, req.userUuid]
    );
    const updatedRecord = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    res.json({ record: updatedRecord });
  } catch (err) {
    console.error('Failed to update list record', err);
    res.status(500).json({ error: 'Failed to update list record' });
  }
});

app.post('/api/lists/:listId/like', requireAuth, async (req, res) => {
  console.log('Liking list...');
  const listId = Number(req.params.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'Invalid list id' });
  }
  let connection;
  try {
    const pool = await getPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [listRows] = await connection.query(
      `SELECT id, userUuid, isPrivate FROM List WHERE id = ? FOR UPDATE`,
      [listId]
    );
    if (!Array.isArray(listRows) || listRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'List not found' });
    }
    const listRow = listRows[0];
    if (listRow.userUuid === req.userUuid) {
      await connection.rollback();
      return res.status(400).json({ error: "You can't like your own list" });
    }
    if (Number(listRow.isPrivate) === 1 && listRow.userUuid !== req.userUuid) {
      await connection.rollback();
      return res.status(403).json({ error: 'List is private' });
    }

    const [existingRows] = await connection.query(
      `SELECT 1 FROM ListLike WHERE listId = ? AND userUuid = ? LIMIT 1`,
      [listId, req.userUuid]
    );
    if (Array.isArray(existingRows) && existingRows.length > 0) {
      await connection.commit();
      return res.json({ success: true, liked: true });
    }

    await connection.query(
      `INSERT INTO ListLike (listId, userUuid, created) VALUES (?, ?, UTC_TIMESTAMP())`,
      [listId, req.userUuid]
    );
    await connection.query(
      `UPDATE List SET likes = likes + 1 WHERE id = ?`,
      [listId]
    );

    await connection.commit();
    res.json({ success: true, liked: true });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error('Failed to like list', err);
    res.status(500).json({ error: 'Failed to like list' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.delete('/api/lists/:listId/like', requireAuth, async (req, res) => {
  console.log('Unliking list...');
  const listId = Number(req.params.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'Invalid list id' });
  }
  let connection;
  try {
    const pool = await getPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [listRows] = await connection.query(
      `SELECT id, userUuid, isPrivate FROM List WHERE id = ? FOR UPDATE`,
      [listId]
    );
    if (!Array.isArray(listRows) || listRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'List not found' });
    }
    const listRow = listRows[0];
    if (Number(listRow.isPrivate) === 1 && listRow.userUuid !== req.userUuid) {
      await connection.rollback();
      return res.status(403).json({ error: 'List is private' });
    }

    const [deleteResult] = await connection.query(
      `DELETE FROM ListLike WHERE listId = ? AND userUuid = ?`,
      [listId, req.userUuid]
    );
    if (!deleteResult || deleteResult.affectedRows === 0) {
      await connection.commit();
      return res.json({ success: true, liked: false });
    }

    await connection.query(
      `UPDATE List SET likes = CASE WHEN likes > 0 THEN likes - 1 ELSE 0 END WHERE id = ?`,
      [listId]
    );

    await connection.commit();
    res.json({ success: true, liked: false });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        /* ignore */
      }
    }
    console.error('Failed to unlike list', err);
    res.status(500).json({ error: 'Failed to unlike list' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Admin management endpoints
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin listing users...');
  const rawSearch = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 25;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.trunc(offsetRaw) : 0;
  const searchTerm = rawSearch.slice(0, 64);
  const params = [];
  let whereClause = '';
  if (searchTerm) {
    const like = `%${escapeForLike(searchTerm)}%`;
    whereClause = 'WHERE (u.username LIKE ? OR u.displayName LIKE ? OR u.bio LIKE ?)' ;
    params.push(like, like, like);
  }

  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT u.uuid AS userUuid,
              u.username,
              u.displayName,
              u.bio,
              u.created,
              CASE WHEN a.userUuid IS NOT NULL THEN 1 ELSE 0 END AS isAdmin,
              COALESCE(a.canManageAdmins, 0) AS canManageAdmins,
              COALESCE(a.canDeleteUsers, 0) AS canDeleteUsers,
              (SELECT COUNT(*) FROM Follows WHERE followsUuid = u.uuid) AS followersCount,
              (SELECT COUNT(*) FROM Follows WHERE userUuid = u.uuid) AS followingCount
         FROM User u
         LEFT JOIN Admin a ON a.userUuid = u.uuid
         ${whereClause}
         ORDER BY u.created DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM User u ${whereClause}`,
      params
    );
    const total = Number(countRows?.[0]?.total) || 0;
    const users = rows.map((row) => ({
      userUuid: row.userUuid,
      username: row.username,
      displayName: row.displayName ?? null,
      bio: row.bio ?? null,
      joinedDate: normalizeDateOnly(row.created),
      followersCount: normalizeFollowCount(row.followersCount),
      followingCount: normalizeFollowCount(row.followingCount),
      isAdmin: Boolean(row.isAdmin),
      adminPermissions: {
        canManageAdmins: Boolean(row.canManageAdmins),
        canDeleteUsers: Boolean(row.canDeleteUsers),
      },
    }));
    res.json({ users, total, limit, offset });
  } catch (error) {
    console.error('Failed to list users for admin', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

app.patch('/api/admin/users/:userUuid', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin updating user...');
  const targetUuid = typeof req.params.userUuid === 'string' ? req.params.userUuid.trim() : '';
  if (!targetUuid) {
    return res.status(400).json({ error: 'userUuid parameter is required' });
  }

  const {
    username: rawUsername,
    displayName: rawDisplayName,
    bio: rawBio,
    isAdmin,
    adminPermissions: rawAdminPermissions,
    joinedDate: rawJoinedDate,
    removeProfilePic: rawRemoveProfilePic,
  } = req.body || {};

  if (isAdmin !== undefined && typeof isAdmin !== 'boolean') {
    return res.status(400).json({ error: 'isAdmin must be a boolean when provided' });
  }

  let normalizedUsername;
  if (rawUsername !== undefined) {
    if (typeof rawUsername !== 'string') {
      return res.status(400).json({ error: 'username must be a string' });
    }
    const trimmed = rawUsername.trim();
    if (trimmed.length < 3 || trimmed.length > 30) {
      return res.status(400).json({ error: 'Username must be 3-30 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return res.status(400).json({ error: 'Username must contain only letters, numbers, and underscores' });
    }
    normalizedUsername = trimmed;
  }

  let normalizedDisplayName;
  if (rawDisplayName !== undefined) {
    if (rawDisplayName === null) {
      normalizedDisplayName = null;
    } else if (typeof rawDisplayName !== 'string' || !rawDisplayName.trim()) {
      return res.status(400).json({ error: 'Display name cannot be empty' });
    } else {
      normalizedDisplayName = rawDisplayName.trim().slice(0, 50);
    }
  }

  let normalizedBio;
  if (rawBio !== undefined) {
    if (rawBio === null) {
      normalizedBio = null;
    } else if (typeof rawBio !== 'string') {
      return res.status(400).json({ error: 'Bio must be a string or null' });
    } else {
      const trimmedBio = rawBio.trim();
      if (trimmedBio.length > 255) {
        return res.status(400).json({ error: 'Bio must be 255 characters or fewer' });
      }
      normalizedBio = trimmedBio.length > 0 ? trimmedBio : null;
    }
  }

  let normalizedAdminPermissions;
  if (rawAdminPermissions !== undefined) {
    if (typeof rawAdminPermissions !== 'object' || rawAdminPermissions === null) {
      return res.status(400).json({ error: 'adminPermissions must be an object when provided' });
    }
    normalizedAdminPermissions = {
      canManageAdmins: Boolean(rawAdminPermissions.canManageAdmins),
      canDeleteUsers: Boolean(rawAdminPermissions.canDeleteUsers),
    };
  }

  const requiresPrivilege = isAdmin !== undefined || normalizedAdminPermissions !== undefined;
  if (requiresPrivilege && !req.adminPermissions?.canManageAdmins) {
    return res.status(403).json({ error: 'Manage-admin privileges required' });
  }

  const updates = [];
  const params = [];

  // Handle joinedDate and profile picture removal
  let joinedDateUpdateValue = undefined;
  let shouldRemoveProfilePic = false;
    if (rawJoinedDate !== undefined) {
      if (rawJoinedDate === null || rawJoinedDate === "") {
        joinedDateUpdateValue = null;
      } else if (typeof rawJoinedDate === 'string') {
        const trimmed = rawJoinedDate.trim();
        // Accept YYYY-MM-DD or parseable date
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
          ? trimmed
          : new Date(trimmed).toISOString().slice(0, 10);
        if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
          return res.status(400).json({ error: 'joinedDate must be YYYY-MM-DD' });
        }
        joinedDateUpdateValue = iso;
      } else {
        return res.status(400).json({ error: 'joinedDate must be a date string' });
      }
    }

  if (rawRemoveProfilePic !== undefined) {
    shouldRemoveProfilePic = Boolean(rawRemoveProfilePic);
  }

  try {
    const pool = await getPool();
    const [existingRows] = await pool.execute(
      'SELECT uuid FROM User WHERE uuid = ? LIMIT 1',
      [targetUuid]
    );
    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (normalizedUsername !== undefined) {
      const [usernameRows] = await pool.execute(
        'SELECT uuid FROM User WHERE username = ? AND uuid <> ? LIMIT 1',
        [normalizedUsername, targetUuid]
      );
      if (usernameRows.length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      updates.push('username = ?');
      params.push(normalizedUsername);
    }

    if (normalizedDisplayName !== undefined) {
      updates.push('displayName = ?');
      params.push(normalizedDisplayName);
    }

    if (joinedDateUpdateValue !== undefined) {
      // stored as DATETIME; set to midnight of the date
      if (joinedDateUpdateValue === null) {
        updates.push('created = NULL');
      } else {
        updates.push('created = ?');
        params.push(`${joinedDateUpdateValue} 00:00:00`);
      }
    }

    if (normalizedBio !== undefined) {
      updates.push('bio = ?');
      params.push(normalizedBio);
    }

    if (updates.length > 0) {
      params.push(targetUuid);
      await pool.execute(`UPDATE User SET ${updates.join(', ')} WHERE uuid = ?`, params);
    }

    if (shouldRemoveProfilePic) {
      // remove profile picture file and clear DB column
      try {
        const [userRows] = await pool.execute('SELECT profilePic FROM User WHERE uuid = ? LIMIT 1', [targetUuid]);
        if (Array.isArray(userRows) && userRows.length > 0) {
          const currentPath = userRows[0].profilePic;
          if (currentPath) {
            await deleteProfilePicFile(currentPath);
          }
        }
        await pool.execute('UPDATE User SET profilePic = NULL WHERE uuid = ?', [targetUuid]);
      } catch (err) {
        console.warn('Failed removing profile pic during admin update', err);
      }
    }

    const [adminRows] = await pool.execute(
      'SELECT canManageAdmins, canDeleteUsers FROM Admin WHERE userUuid = ? LIMIT 1',
      [targetUuid]
    );
    const targetWasAdmin = Array.isArray(adminRows) && adminRows.length > 0;
    const existingAdmin = targetWasAdmin ? adminRows[0] : null;

    if (isAdmin === true) {
      const permissionsToApply = normalizedAdminPermissions ?? {
        canManageAdmins: targetWasAdmin ? Boolean(existingAdmin.canManageAdmins) : false,
        canDeleteUsers: targetWasAdmin ? Boolean(existingAdmin.canDeleteUsers) : false,
      };
      if (targetWasAdmin) {
        await pool.execute(
          'UPDATE Admin SET canManageAdmins = ?, canDeleteUsers = ? WHERE userUuid = ?',
          [permissionsToApply.canManageAdmins ? 1 : 0, permissionsToApply.canDeleteUsers ? 1 : 0, targetUuid]
        );
      } else {
        await pool.execute(
          'INSERT INTO Admin (userUuid, canManageAdmins, canDeleteUsers) VALUES (?, ?, ?)',
          [targetUuid, permissionsToApply.canManageAdmins ? 1 : 0, permissionsToApply.canDeleteUsers ? 1 : 0]
        );
      }
    } else if (isAdmin === false) {
      if (targetWasAdmin) {
        const remainingAdmins = await countOtherAdmins(pool, targetUuid);
        if (remainingAdmins <= 0) {
          return res.status(400).json({ error: 'At least one admin user is required' });
        }
        if (existingAdmin && existingAdmin.canManageAdmins) {
          const remainingManagers = await countOtherManageAdmins(pool, targetUuid);
          if (remainingManagers <= 0) {
            return res.status(400).json({ error: 'At least one admin must retain canManageAdmins' });
          }
        }
        await pool.execute('DELETE FROM Admin WHERE userUuid = ?', [targetUuid]);
      }
    } else if (normalizedAdminPermissions) {
      if (!targetWasAdmin) {
        return res.status(400).json({ error: 'User is not an admin' });
      }
      if (existingAdmin && existingAdmin.canManageAdmins && !normalizedAdminPermissions.canManageAdmins) {
        const remainingManagers = await countOtherManageAdmins(pool, targetUuid);
        if (remainingManagers <= 0) {
          return res.status(400).json({ error: 'At least one admin must retain canManageAdmins' });
        }
      }
      await pool.execute(
        'UPDATE Admin SET canManageAdmins = ?, canDeleteUsers = ? WHERE userUuid = ?',
        [normalizedAdminPermissions.canManageAdmins ? 1 : 0, normalizedAdminPermissions.canDeleteUsers ? 1 : 0, targetUuid]
      );
    }

    const [rows] = await pool.query(
      `SELECT u.uuid AS userUuid,
              u.username,
              u.displayName,
              u.bio,
              u.created,
              CASE WHEN a.userUuid IS NOT NULL THEN 1 ELSE 0 END AS isAdmin,
              COALESCE(a.canManageAdmins, 0) AS canManageAdmins,
              COALESCE(a.canDeleteUsers, 0) AS canDeleteUsers,
              (SELECT COUNT(*) FROM Follows WHERE followsUuid = u.uuid) AS followersCount,
              (SELECT COUNT(*) FROM Follows WHERE userUuid = u.uuid) AS followingCount
         FROM User u
         LEFT JOIN Admin a ON a.userUuid = u.uuid
         WHERE u.uuid = ?
         LIMIT 1`,
      [targetUuid]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'User not found after update' });
    }
    const row = rows[0];
    res.json({
      user: {
        userUuid: row.userUuid,
        username: row.username,
        displayName: row.displayName ?? null,
        bio: row.bio ?? null,
        joinedDate: normalizeDateOnly(row.created),
        followersCount: normalizeFollowCount(row.followersCount),
        followingCount: normalizeFollowCount(row.followingCount),
        isAdmin: Boolean(row.isAdmin),
        adminPermissions: {
          canManageAdmins: Boolean(row.canManageAdmins),
          canDeleteUsers: Boolean(row.canDeleteUsers),
        },
      },
    });
  } catch (error) {
    console.error('Failed to update user as admin', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/admin/users/:userUuid', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin deleting user...');
  const targetUuid = typeof req.params.userUuid === 'string' ? req.params.userUuid.trim() : '';
  if (!targetUuid) {
    return res.status(400).json({ error: 'userUuid parameter is required' });
  }
  if (!req.adminPermissions?.canDeleteUsers) {
    return res.status(403).json({ error: 'Delete-user privileges required' });
  }
  if (targetUuid === req.userUuid) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  try {
    const pool = await getPool();
    const existingPermissions = await getAdminPermissions(pool, targetUuid);
    if (existingPermissions) {
      const remainingAdmins = await countOtherAdmins(pool, targetUuid);
      if (remainingAdmins <= 0) {
        return res.status(400).json({ error: 'At least one admin user is required' });
      }
      if (existingPermissions.canManageAdmins) {
        const remainingManagers = await countOtherManageAdmins(pool, targetUuid);
        if (remainingManagers <= 0) {
          return res.status(400).json({ error: 'At least one admin must retain canManageAdmins' });
        }
      }
    }

    const [result] = await pool.execute('DELETE FROM User WHERE uuid = ?', [targetUuid]);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete user as admin', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.get('/api/admin/records', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin listing records...');
  const rawSearch = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rawOwner = typeof req.query.user === 'string' ? req.query.user.trim() : '';
  const rawMasterId = typeof req.query.masterId === 'string' ? req.query.masterId.trim() : '';
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 25;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.trunc(offsetRaw) : 0;
  const searchTerm = rawSearch.slice(0, 64);
  const conditions = [];
  const params = [];

  if (rawOwner) {
    conditions.push('u.username = ?');
    params.push(rawOwner);
  }

  if (searchTerm) {
    const like = `%${escapeForLike(searchTerm)}%`;
    conditions.push('(r.name LIKE ? OR r.artist LIKE ? OR u.username LIKE ? OR u.displayName LIKE ? OR r.review LIKE ? )');
    params.push(like, like, like, like, like);
  }

  if (rawMasterId) {
    const masterId = Number(rawMasterId);
    if (Number.isInteger(masterId) && masterId > 0) {
      conditions.push('r.masterId = ?');
      params.push(masterId);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT r.id,
              r.name,
              r.artist,
              r.cover,
              r.rating,
              r.review,
              r.added,
              r.isCustom,
              r.masterId,
              r.release_year,
              u.username,
              u.displayName,
              rt.name AS tableName
         FROM Record r
         JOIN User u ON r.userUuid = u.uuid
         LEFT JOIN RecTable rt ON r.tableId = rt.id
         ${whereClause}
         ORDER BY r.added DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM Record r
         JOIN User u ON r.userUuid = u.uuid
         LEFT JOIN RecTable rt ON r.tableId = rt.id
         ${whereClause}`,
      params
    );
    const total = Number(countRows?.[0]?.total) || 0;
    const records = rows.map((row) => ({
      id: row.id,
      record: row.name,
      artist: row.artist ?? null,
      cover: row.cover ?? null,
      rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : null,
      review: row.review ?? null,
      added: row.added ? formatUtcDateTime(row.added) : null,
      isCustom: Boolean(row.isCustom),
      masterId: row.masterId !== null && row.masterId !== undefined ? Number(row.masterId) : null,
      releaseYear: row.release_year !== null && row.release_year !== undefined ? Number(row.release_year) : null,
      owner: {
        username: row.username,
        displayName: row.displayName ?? null,
      },
      tableName: row.tableName ?? null,
    }));
    res.json({ records, total, limit, offset });
  } catch (error) {
    console.error('Failed to list records for admin', error);
    res.status(500).json({ error: 'Failed to list records' });
  }
});

app.patch('/api/admin/records/:recordId', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin updating record...');
  const recordId = Number(req.params.recordId);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    return res.status(400).json({ error: 'recordId must be a positive integer' });
  }

  const {
    record: recordName,
    artist,
    cover,
    rating,
    review,
    masterId,
    releaseYear,
    isCustom,
    added,
  } = req.body || {};

  const updates = [];
  const params = [];

  if (recordName !== undefined) {
    if (typeof recordName !== 'string' || !recordName.trim()) {
      return res.status(400).json({ error: 'record must be a non-empty string' });
    }
    updates.push('name = ?');
    params.push(recordName.trim().slice(0, 255));
  }

  if (artist !== undefined) {
    if (artist === null) {
      updates.push('artist = ?');
      params.push(null);
    } else if (typeof artist !== 'string') {
      return res.status(400).json({ error: 'artist must be a string or null' });
    } else {
      updates.push('artist = ?');
      params.push(artist.trim().slice(0, 255));
    }
  }

  if (cover !== undefined) {
    if (cover === null) {
      updates.push('cover = ?');
      params.push(null);
    } else if (typeof cover !== 'string') {
      return res.status(400).json({ error: 'cover must be a string or null' });
    } else {
      updates.push('cover = ?');
      params.push(cover.trim().slice(0, 255));
    }
  }

  if (rating !== undefined) {
    if (rating === null) {
      updates.push('rating = ?');
      params.push(null);
    } else {
      const ratingValue = Number(rating);
      if (!Number.isFinite(ratingValue)) {
        return res.status(400).json({ error: 'rating must be a number between 0 and 10' });
      }
      const clamped = Math.min(Math.max(Math.round(ratingValue), 0), 10);
      updates.push('rating = ?');
      params.push(clamped);
    }
  }

  if (review !== undefined) {
    if (review === null) {
      updates.push('review = ?');
      params.push(null);
    } else if (typeof review !== 'string') {
      return res.status(400).json({ error: 'review must be a string or null' });
    } else {
      const trimmedReview = review.trim();
      if (trimmedReview.length > 5000) {
        return res.status(400).json({ error: 'review must be 5000 characters or fewer' });
      }
      updates.push('review = ?');
      params.push(trimmedReview.length > 0 ? trimmedReview : null);
    }
  }

  if (masterId !== undefined) {
    if (masterId === null) {
      updates.push('masterId = ?');
      params.push(null);
    } else {
      const masterValue = Number(masterId);
      if (!Number.isInteger(masterValue) || masterValue <= 0) {
        return res.status(400).json({ error: 'masterId must be a positive integer or null' });
      }
      updates.push('masterId = ?');
      params.push(masterValue);
    }
  }

  if (releaseYear !== undefined) {
    if (releaseYear === null) {
      updates.push('release_year = ?');
      params.push(null);
    } else {
      const releaseValue = Number(releaseYear);
      if (!Number.isInteger(releaseValue) || releaseValue < 1901 || releaseValue > 2100) {
        return res.status(400).json({ error: 'releaseYear must be between 1901 and 2100' });
      }
      updates.push('release_year = ?');
      params.push(releaseValue);
    }
  }

  if (isCustom !== undefined) {
    if (typeof isCustom !== 'boolean') {
      return res.status(400).json({ error: 'isCustom must be a boolean when provided' });
    }
    updates.push('isCustom = ?');
    params.push(isCustom ? 1 : 0);
  }

  if (added !== undefined) {
    if (typeof added !== 'string' || !added.trim()) {
      return res.status(400).json({ error: 'added must be a non-empty string in YYYY-MM-DD HH:MM:SS format' });
    }
    const trimmedAdded = added.trim();
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmedAdded)) {
      return res.status(400).json({ error: 'added must be formatted as YYYY-MM-DD HH:MM:SS' });
    }
    const date = new Date(trimmedAdded.replace(' ', 'T') + 'Z');
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: 'added timestamp is invalid' });
    }
    updates.push('added = ?');
    params.push(trimmedAdded);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No changes supplied' });
  }

  try {
    const pool = await getPool();
    const [existingRows] = await pool.execute(
      'SELECT id FROM Record WHERE id = ? LIMIT 1',
      [recordId]
    );
    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    params.push(recordId);
    await pool.execute(`UPDATE Record SET ${updates.join(', ')} WHERE id = ?`, params);

    const [rows] = await pool.query(
      `SELECT r.id,
              r.name,
              r.artist,
              r.cover,
              r.rating,
              r.review,
              r.added,
              r.isCustom,
              r.masterId,
              r.release_year,
              u.username,
              u.displayName,
              rt.name AS tableName
         FROM Record r
         JOIN User u ON r.userUuid = u.uuid
         LEFT JOIN RecTable rt ON r.tableId = rt.id
         WHERE r.id = ?
         LIMIT 1`,
      [recordId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Record not found after update' });
    }
    const row = rows[0];
    res.json({
      record: {
        id: row.id,
        record: row.name,
        artist: row.artist ?? null,
        cover: row.cover ?? null,
        rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : null,
        review: row.review ?? null,
        added: row.added ? formatUtcDateTime(row.added) : null,
        isCustom: Boolean(row.isCustom),
        masterId: row.masterId !== null && row.masterId !== undefined ? Number(row.masterId) : null,
        releaseYear: row.release_year !== null && row.release_year !== undefined ? Number(row.release_year) : null,
        owner: {
          username: row.username,
          displayName: row.displayName ?? null,
        },
        tableName: row.tableName ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to update record as admin', error);
    res.status(500).json({ error: 'Failed to update record' });
  }
});

app.delete('/api/admin/records/:recordId', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin deleting record...');
  const recordId = Number(req.params.recordId);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    return res.status(400).json({ error: 'recordId must be a positive integer' });
  }

  try {
    const pool = await getPool();
    const [result] = await pool.execute('DELETE FROM Record WHERE id = ?', [recordId]);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete record as admin', error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

app.get('/api/admin/masters', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin listing masters...');
  const rawSearch = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 25;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.trunc(offsetRaw) : 0;
  const searchTerm = rawSearch.slice(0, 64);
  const params = [];
  let whereClause = '';
  if (searchTerm) {
    const like = `%${escapeForLike(searchTerm)}%`;
    whereClause = 'WHERE (m.name LIKE ? OR m.artist LIKE ? OR m.cover LIKE ?)' ;
    params.push(like, like, like);
  }

  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT m.id,
              m.name,
              m.artist,
              m.cover,
              m.release_year,
              m.ratingAve
         FROM Master m
         ${whereClause}
         ORDER BY m.id DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM Master m ${whereClause}`,
      params
    );
    const total = Number(countRows?.[0]?.total) || 0;
    const masters = rows.map((row) => ({
      id: row.id,
      name: row.name,
      artist: row.artist ?? null,
      cover: row.cover ?? null,
      releaseYear: row.release_year !== null && row.release_year !== undefined ? Number(row.release_year) : null,
      ratingAverage: row.ratingAve !== null && row.ratingAve !== undefined ? Number(row.ratingAve) : null,
    }));
    res.json({ masters, total, limit, offset });
  } catch (error) {
    console.error('Failed to list masters for admin', error);
    res.status(500).json({ error: 'Failed to list masters' });
  }
});

app.patch('/api/admin/masters/:masterId', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin updating master...');
  const masterId = Number(req.params.masterId);
  if (!Number.isInteger(masterId) || masterId <= 0) {
    return res.status(400).json({ error: 'masterId must be a positive integer' });
  }

  const { name, artist, cover, releaseYear } = req.body || {};
  const updates = [];
  const params = [];

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name must be a non-empty string' });
    }
    updates.push('name = ?');
    params.push(name.trim().slice(0, 255));
  }

  if (artist !== undefined) {
    if (artist === null) {
      updates.push('artist = ?');
      params.push(null);
    } else if (typeof artist !== 'string') {
      return res.status(400).json({ error: 'artist must be a string or null' });
    } else {
      updates.push('artist = ?');
      params.push(artist.trim().slice(0, 255));
    }
  }

  if (cover !== undefined) {
    if (cover === null) {
      updates.push('cover = ?');
      params.push(null);
    } else if (typeof cover !== 'string') {
      return res.status(400).json({ error: 'cover must be a string or null' });
    } else {
      updates.push('cover = ?');
      params.push(cover.trim().slice(0, 255));
    }
  }

  if (releaseYear !== undefined) {
    if (releaseYear === null) {
      updates.push('release_year = ?');
      params.push(null);
    } else {
      const releaseValue = Number(releaseYear);
      if (!Number.isInteger(releaseValue) || releaseValue < 1901 || releaseValue > 2100) {
        return res.status(400).json({ error: 'releaseYear must be between 1901 and 2100' });
      }
      updates.push('release_year = ?');
      params.push(releaseValue);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No changes supplied' });
  }

  try {
    const pool = await getPool();
    const [existingRows] = await pool.execute(
      'SELECT id FROM Master WHERE id = ? LIMIT 1',
      [masterId]
    );
    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ error: 'Master not found' });
    }

    params.push(masterId);
    await pool.execute(`UPDATE Master SET ${updates.join(', ')} WHERE id = ?`, params);

    const [rows] = await pool.query(
      `SELECT m.id,
              m.name,
              m.artist,
              m.cover,
              m.release_year,
              m.ratingAve
         FROM Master m
         WHERE m.id = ?
         LIMIT 1`,
      [masterId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Master not found after update' });
    }
    const row = rows[0];
    res.json({
      master: {
        id: row.id,
        name: row.name,
        artist: row.artist ?? null,
        cover: row.cover ?? null,
        releaseYear: row.release_year !== null && row.release_year !== undefined ? Number(row.release_year) : null,
        ratingAverage: row.ratingAve !== null && row.ratingAve !== undefined ? Number(row.ratingAve) : null,
      },
    });
  } catch (error) {
    console.error('Failed to update master as admin', error);
    res.status(500).json({ error: 'Failed to update master' });
  }
});

app.delete('/api/admin/masters/:masterId', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin deleting master...');
  const masterId = Number(req.params.masterId);
  if (!Number.isInteger(masterId) || masterId <= 0) {
    return res.status(400).json({ error: 'masterId must be a positive integer' });
  }

  try {
    const pool = await getPool();
    const [result] = await pool.execute('DELETE FROM Master WHERE id = ?', [masterId]);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'Master not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete master as admin', error);
    res.status(500).json({ error: 'Failed to delete master' });
  }
});

app.get('/api/admin/tags', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin listing tags...');
  const rawSearch = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rawOwner = typeof req.query.user === 'string' ? req.query.user.trim() : '';
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 25;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.trunc(offsetRaw) : 0;
  const searchTerm = rawSearch.slice(0, 64);
  const conditions = [];
  const params = [];

  if (searchTerm) {
    const like = `%${escapeForLike(searchTerm)}%`;
    conditions.push('t.name LIKE ?');
    params.push(like);
  }

  if (rawOwner) {
    conditions.push('u.username = ?');
    params.push(rawOwner);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT t.id,
              t.name,
              u.username,
              u.displayName,
              (SELECT COUNT(*) FROM Tagged WHERE tagId = t.id) AS usageCount
         FROM Tag t
         LEFT JOIN User u ON t.userUuid = u.uuid
         ${whereClause}
         ORDER BY t.id DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
         FROM Tag t
         LEFT JOIN User u ON t.userUuid = u.uuid
         ${whereClause}`,
      params
    );
    const total = Number(countRows?.[0]?.total) || 0;
    const tags = rows.map((row) => ({
      id: row.id,
      name: row.name,
      owner: row.username
        ? {
            username: row.username,
            displayName: row.displayName ?? null,
          }
        : null,
      usageCount: Number.isFinite(Number(row.usageCount)) ? Number(row.usageCount) : 0,
    }));
    res.json({ tags, total, limit, offset });
  } catch (error) {
    console.error('Failed to list tags for admin', error);
    res.status(500).json({ error: 'Failed to list tags' });
  }
});

app.patch('/api/admin/tags/:tagId', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin updating tag...');
  const tagId = Number(req.params.tagId);
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return res.status(400).json({ error: 'tagId must be a positive integer' });
  }

  const { name } = req.body || {};
  if (name === undefined) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name must be a non-empty string' });
  }
  const trimmedName = name.trim();
  if (trimmedName.length > 50) {
    return res.status(400).json({ error: 'name must be 50 characters or fewer' });
  }

  try {
    const pool = await getPool();
    const [existingRows] = await pool.execute(
      'SELECT id FROM Tag WHERE id = ? LIMIT 1',
      [tagId]
    );
    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    await pool.execute('UPDATE Tag SET name = ? WHERE id = ?', [trimmedName, tagId]);

    const [rows] = await pool.query(
      `SELECT t.id,
              t.name,
              u.username,
              u.displayName,
              (SELECT COUNT(*) FROM Tagged WHERE tagId = t.id) AS usageCount
         FROM Tag t
         LEFT JOIN User u ON t.userUuid = u.uuid
         WHERE t.id = ?
         LIMIT 1`,
      [tagId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found after update' });
    }
    const row = rows[0];
    res.json({
      tag: {
        id: row.id,
        name: row.name,
        owner: row.username
          ? {
              username: row.username,
              displayName: row.displayName ?? null,
            }
          : null,
        usageCount: Number.isFinite(Number(row.usageCount)) ? Number(row.usageCount) : 0,
      },
    });
  } catch (error) {
    console.error('Failed to update tag as admin', error);
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

app.delete('/api/admin/tags/:tagId', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin deleting tag...');
  const tagId = Number(req.params.tagId);
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return res.status(400).json({ error: 'tagId must be a positive integer' });
  }

  try {
    const pool = await getPool();
    const [result] = await pool.execute('DELETE FROM Tag WHERE id = ?', [tagId]);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete tag as admin', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Admin list endpoints
app.get('/api/admin/lists', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin listing lists...');
  const rawSearch = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rawOwner = typeof req.query.user === 'string' ? req.query.user.trim() : '';
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 25;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.trunc(offsetRaw) : 0;
  const searchTerm = rawSearch.slice(0, 128);
  const conditions = [];
  const params = [];

  if (searchTerm) {
    const like = `%${escapeForLike(searchTerm)}%`;
    conditions.push('(l.name LIKE ? OR l.description LIKE ?)');
    params.push(like, like);
  }

  if (rawOwner) {
    conditions.push('u.username = ?');
    params.push(rawOwner);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT l.id, l.name, l.description, l.isPrivate, l.likes, l.picture, l.created,
              u.username, u.displayName, u.profilePic,
              COALESCE(stats.recordCount, 0) AS recordCount
         FROM List l
         JOIN User u ON u.uuid = l.userUuid
         LEFT JOIN (
           SELECT listId, COUNT(*) AS recordCount FROM ListRecord GROUP BY listId
         ) stats ON stats.listId = l.id
        ${whereClause}
        ORDER BY l.created DESC
        LIMIT ? OFFSET ?`,
      params
    );
    const lists = Array.isArray(rows) ? rows.map(row => ({
      id: Number(row.id),
      name: String(row.name ?? ''),
      description: row.description && String(row.description).trim() ? String(row.description) : null,
      isPrivate: row.isPrivate === 1 || row.isPrivate === true,
      likes: Number.isFinite(Number(row.likes)) ? Number(row.likes) : 0,
      pictureUrl: row.picture && String(row.picture).trim() ? String(row.picture) : null,
      recordCount: Number.isFinite(Number(row.recordCount)) ? Number(row.recordCount) : 0,
      created: row.created && String(row.created).trim() ? String(row.created) : null,
      owner: {
        username: String(row.username ?? ''),
        displayName: row.displayName && String(row.displayName).trim() ? String(row.displayName) : null,
        profilePicUrl: buildProfilePicPublicPath(row.profilePic),
      },
    })) : [];
    res.json({ lists });
  } catch (error) {
    console.error('Failed to fetch admin lists', error);
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

app.get('/api/admin/lists/:listId/records', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin fetching list records...');
  const listId = Number(req.params.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'listId must be a positive integer' });
  }

  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT lr.id, lr.name, lr.artist, lr.cover, lr.rating, lr.release_year AS releaseYear,
              lr.added, lr.masterId, lr.sortOrder
         FROM ListRecord lr
        WHERE lr.listId = ?
        ORDER BY lr.sortOrder ASC, lr.added DESC`,
      [listId]
    );
    const records = Array.isArray(rows) ? rows.map(mapListRecordRow) : [];
    res.json({ records });
  } catch (error) {
    console.error('Failed to fetch list records as admin', error);
    res.status(500).json({ error: 'Failed to fetch list records' });
  }
});

app.patch('/api/admin/lists/:listId', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin updating list...');
  const listId = Number(req.params.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'listId must be a positive integer' });
  }

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : null;
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;
  const isPrivate = req.body.isPrivate === true || req.body.isPrivate === 1 || req.body.isPrivate === '1';

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const pool = await getPool();
    await pool.execute(
      `UPDATE List SET name = ?, description = ?, isPrivate = ? WHERE id = ?`,
      [name, description, isPrivate, listId]
    );

    const [rows] = await pool.query(
      `SELECT l.id, l.name, l.description, l.isPrivate, l.likes, l.picture, l.created,
              u.username, u.displayName, u.profilePic,
              COALESCE(stats.recordCount, 0) AS recordCount
         FROM List l
         JOIN User u ON u.uuid = l.userUuid
         LEFT JOIN (
           SELECT listId, COUNT(*) AS recordCount FROM ListRecord GROUP BY listId
         ) stats ON stats.listId = l.id
        WHERE l.id = ?
        LIMIT 1`,
      [listId]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }

    const row = rows[0];
    const list = {
      id: Number(row.id),
      name: String(row.name ?? ''),
      description: row.description && String(row.description).trim() ? String(row.description) : null,
      isPrivate: row.isPrivate === 1 || row.isPrivate === true,
      likes: Number.isFinite(Number(row.likes)) ? Number(row.likes) : 0,
      pictureUrl: row.picture && String(row.picture).trim() ? String(row.picture) : null,
      recordCount: Number.isFinite(Number(row.recordCount)) ? Number(row.recordCount) : 0,
      created: row.created && String(row.created).trim() ? String(row.created) : null,
      owner: {
        username: String(row.username ?? ''),
        displayName: row.displayName && String(row.displayName).trim() ? String(row.displayName) : null,
        profilePicUrl: buildProfilePicPublicPath(row.profilePic),
      },
    };
    res.json({ list });
  } catch (error) {
    console.error('Failed to update list as admin', error);
    res.status(500).json({ error: 'Failed to update list' });
  }
});

app.delete('/api/admin/lists/:listId/picture', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin deleting list picture...');
  const listId = Number(req.params.listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'listId must be a positive integer' });
  }

  try {
    const pool = await getPool();
    await pool.execute('UPDATE List SET picture = NULL WHERE id = ?', [listId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete list picture as admin', error);
    res.status(500).json({ error: 'Failed to delete list picture' });
  }
});

app.delete('/api/admin/lists/:listId/records/:recordId', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin deleting record from list...');
  const listId = Number(req.params.listId);
  const recordId = Number(req.params.recordId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'listId must be a positive integer' });
  }
  if (!Number.isInteger(recordId) || recordId <= 0) {
    return res.status(400).json({ error: 'recordId must be a positive integer' });
  }

  try {
    const pool = await getPool();
    const [result] = await pool.execute(
      'DELETE FROM ListRecord WHERE id = ? AND listId = ?',
      [recordId, listId]
    );
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found in list' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete record from list as admin', error);
    res.status(500).json({ error: 'Failed to delete record from list' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
