/**
 * @author Colin Brown
 * @description Main server application for My Record Collection - a music collection management platform
 * Handles API routes for records, users, authentication, Discogs integration, and community features
 * Built with Express.js and MySQL
 */

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

/**
 * GET /robots.txt
 * Returns robots.txt file for search engine crawlers
 * @returns {string} robots.txt content
 */
// Serve robots.txt for API subdomain
app.get("/robots.txt", (_req, res) => {
  res.type("text/plain");
  res.send("User-agent: *\nDisallow: /\n");
});

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

/**
 * Validates that uploaded file is an allowed image format (JPG, PNG, WEBP, AVIF)
 * @param {Object} _req - Express request object (unused)
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback function
 */
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

/**
 * Builds relative path for profile picture storage
 * @param {string} filename - The uploaded filename
 * @returns {string} Relative path for storage
 */
function buildProfilePicRelativePath(filename) {
  return `profile/${filename}`;
}

/**
 * Converts relative profile picture path to public URL
 * @param {string} relativePath - Relative path in storage
 * @returns {string|null} Public URL or null if no path
 */
function buildProfilePicPublicPath(relativePath) {
  if (!relativePath) return null;
  const normalized = relativePath.replace(/\\/g, "/");
  return `/uploads/${normalized}`;
}

/**
 * Deletes a profile picture file from disk storage
 * @param {string} relativePath - Relative path to the file
 * @returns {Promise<void>}
 */
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

/**
 * Builds relative path for list picture storage
 * @param {string} filename - The uploaded filename
 * @returns {string} Relative path for storage
 */
function buildListPicRelativePath(filename) {
  return `list/${filename}`;
}

/**
 * Converts relative list picture path to public URL
 * @param {string} relativePath - Relative path in storage
 * @returns {string|null} Public URL or null if no path
 */
function buildListPicPublicPath(relativePath) {
  if (!relativePath) return null;
  const normalized = relativePath.replace(/\\/g, "/");
  return `/uploads/${normalized}`;
}

/**
 * Deletes a list picture file from disk storage
 * @param {string} relativePath - Relative path to the file
 * @returns {Promise<void>}
 */
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

/**
 * Utility function to delay execution for a specified time
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Normalizes follow count to a non-negative integer
 * @param {*} value - Raw follow count value
 * @returns {number} Normalized count (0 if invalid)
 */
function normalizeFollowCount(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.trunc(num);
}

/**
 * Normalizes any value to a non-negative integer
 * @param {*} value - Raw value to normalize
 * @returns {number} Normalized integer (0 if invalid)
 */
function normalizeNonNegativeInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.trunc(num);
}

/**
 * Converts date value to YYYY-MM-DD format string
 * @param {*} value - Date value (string, Date object, or other)
 * @returns {string|null} Formatted date string or null if invalid
 */
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

/**
 * Formats a date/time value as UTC string in format YYYY-MM-DD HH:MM:SS
 * @param {*} value - Date value or timestamp
 * @returns {string|null} Formatted datetime string or null if invalid
 */
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

/**
 * Validates a masterId string.
 * Valid formats: numeric string (e.g., "12345") or 'r' + numeric string (e.g., "r12345")
 * Returns true if valid, false otherwise.
 */
function isValidMasterId(masterId) {
  if (typeof masterId !== "string" || !masterId) {
    return false;
  }
  // Check if it's a release ID (prefixed with 'r') or a master ID (numeric only)
  const isRelease = masterId.startsWith("r");
  const numericPart = isRelease ? masterId.slice(1) : masterId;
  const num = Number(numericPart);
  return Number.isInteger(num) && num > 0;
}

/**
 * Parses a masterId value and returns it as a validated string, or null if invalid.
 * Accepts string or number inputs.
 */
function parseMasterId(value) {
  if (typeof value === "string" && isValidMasterId(value)) {
    return value;
  }
  // Handle legacy numeric masterId values
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  // Handle string that's just a number
  if (typeof value === "string") {
    const num = Number(value);
    if (Number.isInteger(num) && num > 0) {
      return String(num);
    }
  }
  return null;
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

/**
 * Fetches record data with associated tags for given record IDs
 * @async
 * @param {Object} pool - MySQL connection pool
 * @param {string} userUuid - User UUID
 * @param {number[]} recordIds - Array of record IDs to fetch
 * @returns {Promise<Array>} Array of record objects with tags
 */
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

/**
 * Retrieves a public user's profile data by username
 * @async
 * @param {Object} pool - MySQL connection pool
 * @param {string} username - The username to look up
 * @returns {Promise<Object|null>} User profile object or null if not found
 */
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

/**
 * Gets list of users following a given user
 * @async
 * @param {Object} pool - MySQL connection pool
 * @param {string} userUuid - The user UUID to get followers for
 * @param {number|null} limit - Optional limit for pagination
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of follower user summaries
 */
async function getFollowersForUser(pool, userUuid, limit = null, offset = 0) {
  let query = `SELECT follower.username, follower.displayName, follower.profilePic,
            (SELECT COUNT(*) FROM Follows WHERE followsUuid = follower.uuid) AS followersCount,
            (SELECT COUNT(*) FROM Follows WHERE userUuid = follower.uuid) AS followingCount
     FROM Follows f
     JOIN User follower ON f.userUuid = follower.uuid
     WHERE f.followsUuid = ?
     ORDER BY follower.username`;
  
  const params = [userUuid];
  if (limit !== null) {
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
  }
  
  const [rows] = await pool.query(query, params);
  return rows.map(mapCommunityUserSummary);
}

/**
 * Gets list of users that a given user is following
 * @async
 * @param {Object} pool - MySQL connection pool
 * @param {string} userUuid - The user UUID to get following list for
 * @param {number|null} limit - Optional limit for pagination
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of following user summaries
 */
async function getFollowingForUser(pool, userUuid, limit = null, offset = 0) {
  let query = `SELECT following.username, following.displayName, following.profilePic,
            (SELECT COUNT(*) FROM Follows WHERE followsUuid = following.uuid) AS followersCount,
            (SELECT COUNT(*) FROM Follows WHERE userUuid = following.uuid) AS followingCount
     FROM Follows f
     JOIN User following ON f.followsUuid = following.uuid
     WHERE f.userUuid = ?
     ORDER BY following.username`;
  
  const params = [userUuid];
  if (limit !== null) {
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
  }
  
  const [rows] = await pool.query(query, params);
  return rows.map(mapCommunityUserSummary);
}

/**
 * Normalizes raw database row into standardized public user object
 * @param {Object} row - Database row with user data
 * @returns {Object|null} Normalized public user object or null
 */
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

/**
 * Maps database row to community user summary (for followers/following lists)
 * @param {Object} row - Database row with user data
 * @returns {Object} Community user summary object
 */
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

/**
 * Maps database row to standardized list summary object
 * @param {Object} row - Database row with list data
 * @returns {Object} List summary object with normalized fields
 */
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

/**
 * Maps database row to list summary including owner information
 * @param {Object} row - Database row with list and user data
 * @returns {Object} List summary with owner details
 */
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

/**
 * Maps database row to list record (record within a list) object
 * @param {Object} row - Database row with record data
 * @returns {Object} List record object with normalized fields
 */
function mapListRecordRow(row) {
  const id = Number(row?.id);
  const ratingValue = Number(row?.rating);
  const releaseYearValue = Number(row?.releaseYear);
  const masterIdRaw = row?.masterId;
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
    masterId: parseMasterId(masterIdRaw),
    added: row?.added ? formatUtcDateTime(row.added) : null,
    sortOrder: Number.isInteger(sortOrderValue) && sortOrderValue > 0 ? sortOrderValue : undefined,
  };
}

/**
 * Escapes special characters in LIKE clause for safe SQL queries
 * @param {string} term - The search term to escape
 * @returns {string} Escaped term safe for SQL LIKE
 */
function escapeForLike(term) {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Retrieves admin permissions for a user
 * @async
 * @param {Object} pool - MySQL connection pool
 * @param {string} userUuid - User UUID to check
 * @returns {Promise<Object|null>} Admin permissions object or null if not admin
 */
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

/**
 * Counts total number of other admins (excluding specified user)
 * @async
 * @param {Object} pool - MySQL connection pool
 * @param {string} excludedUuid - User UUID to exclude from count
 * @returns {Promise<number>} Total count of other admins
 */
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

/**
 * Counts total number of admins with manage_admins permission (excluding specified user)
 * @async
 * @param {Object} pool - MySQL connection pool
 * @param {string} excludedUuid - User UUID to exclude from count
 * @returns {Promise<number>} Count of admins with manage permission
 */
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

/**
 * Fetches all tags associated with given record IDs, organized by record
 * @async
 * @param {Object} pool - MySQL connection pool
 * @param {number[]} recordIds - Array of record IDs
 * @returns {Promise<Object>} Object mapping recordId to array of tag names
 */
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

/**
 * Builds Discogs API search URL for artist and record name
 * @param {string} artist - Artist name
 * @param {string} record - Record name
 * @returns {string} Formatted Discogs API search URL
 */
function buildDiscogsSearchUrl(artist, record) {
  const url = new URL(DISCOGS_API_URL);
  url.searchParams.set("query", artist + " - " + record);
  url.searchParams.set("per_page", "6");
  if (DISCOGS_API_KEY && DISCOGS_API_SECRET) {
    url.searchParams.set("key", DISCOGS_API_KEY);
    url.searchParams.set("secret", DISCOGS_API_SECRET);
  }
  return url.toString();
}

/**
 * Normalizes release year from Discogs to valid integer or null
 * @param {*} raw - Raw year value
 * @returns {number|null} Year between 1901-2100 or null
 */
function normalizeDiscogsReleaseYear(raw) {
  const year = Number(raw);
  if (Number.isInteger(year) && year >= 1901 && year <= 2100) {
    return year;
  }
  return null;
}

/**
 * Builds Discogs API search URL for barcode lookup
 * @param {string} barcode - Product barcode to search
 * @returns {string} Formatted Discogs API barcode search URL
 */
function buildDiscogsBarcodeSearchUrl(barcode) {
  const url = new URL(DISCOGS_API_URL);
  url.searchParams.set("type", "release");
  url.searchParams.set("barcode", barcode);
  url.searchParams.set("per_page", "6");
  if (DISCOGS_API_KEY && DISCOGS_API_SECRET) {
    url.searchParams.set("key", DISCOGS_API_KEY);
    url.searchParams.set("secret", DISCOGS_API_SECRET);
  }
  return url.toString();
}

/**
 * Splits Discogs title into artist and record name
 * Handles formats like "Artist - Record Name"
 * @param {string} title - The Discogs title to split
 * @returns {Object} Object with artist and record properties
 */
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
        artist: cleanDiscogsArtist(artist) || null,
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
 * Cleans Discogs artist name by removing disambiguation suffixes like "(2)", "(3)", etc.
 * @param {string} artist - The artist name from Discogs
 * @returns {string|null} The cleaned artist name
 */
function cleanDiscogsArtist(artist) {
  if (typeof artist !== "string") {
    return null;
  }
  // Remove trailing disambiguation like " (2)", " (3)", " (42)", etc.
  return artist.replace(/\s*\(\d+\)\s*$/, "").trim() || null;
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
 * Expands common abbreviations in artist/record names for better matching.
 * @param {string} str - The string to expand
 * @returns {string} The expanded string
 */
function expandAbbreviations(str) {
  if (typeof str !== "string") {
    return "";
  }
  const lower = str.toLowerCase();
  // Common abbreviations and their expansions
  const expansions = [
    [/\bltd\.?\b/gi, "limited"],
    [/\binc\.?\b/gi, "incorporated"],
    [/\bcorp\.?\b/gi, "corporation"],
    [/\b&\b/g, "and"],
    [/\bpt\.?\b/gi, "part"],
    [/\bvol\.?\b/gi, "volume"],
    [/\bfeat\.?\b/gi, "featuring"],
    [/\bft\.?\b/gi, "featuring"],
    [/\bintro\.?\b/gi, "introduction"],
    [/\baka\b/gi, "also known as"],
    [/\bep\b/gi, "extended play"],
    [/\blp\b/gi, "long play"],
  ];
  
  let result = lower;
  for (const [pattern, replacement] of expansions) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Extracts significant words from a string (removes common words and short words).
 * @param {string} str - The string to extract words from
 * @returns {string[]} Array of significant words
 */
function extractSignificantWords(str) {
  if (typeof str !== "string") {
    return [];
  }
  const stopWords = new Set(["the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "by", "with"]);
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.has(word));
}

/**
 * Calculates word overlap score between two strings.
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Score between 0 and 1
 */
function wordOverlapScore(str1, str2) {
  const words1 = new Set(extractSignificantWords(expandAbbreviations(str1)));
  const words2 = new Set(extractSignificantWords(expandAbbreviations(str2)));
  
  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }
  
  let matchCount = 0;
  for (const word of words1) {
    if (words2.has(word)) {
      matchCount++;
    }
  }
  
  // Jaccard similarity: intersection / union
  const union = new Set([...words1, ...words2]);
  return matchCount / union.size;
}

/**
 * Calculates a fuzzy similarity score between two strings.
 * @param {string} str1 - First string
 * @param {string} str2 - Second string  
 * @returns {number} Score between 0 and 1
 */
function fuzzySimilarity(str1, str2) {
  const norm1 = normalizeForComparison(expandAbbreviations(str1));
  const norm2 = normalizeForComparison(expandAbbreviations(str2));
  
  // Exact match after normalization
  if (norm1 === norm2) {
    return 1.0;
  }
  
  // One contains the other (for cases like "PiL" matching "Public Image Ltd")
  if (norm1.length > 2 && norm2.length > 2) {
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const shorter = Math.min(norm1.length, norm2.length);
      const longer = Math.max(norm1.length, norm2.length);
      return 0.7 + (0.3 * shorter / longer);
    }
  }
  
  // Word overlap scoring
  return wordOverlapScore(str1, str2);
}

/**
 * Calculates a match score for a Discogs result against expected artist and record.
 * @param {object} discogsResult - The result object from Discogs
 * @param {string} expectedArtist - The artist we're searching for
 * @param {string} expectedRecord - The record name we're searching for
 * @returns {number} Score between 0 and 1, where 1 is a perfect match
 */
function calculateMatchScore(discogsResult, expectedArtist, expectedRecord) {
  if (!discogsResult?.title) {
    return 0;
  }

  const { artist, record } = splitDiscogsTitle(discogsResult.title);
  if (!artist || !record) {
    return 0;
  }

  // Remove trailing (digit) from artist name
  const cleanedArtist = artist.replace(/\s*\(\d+\)\s*$/, "").trim();

  const artistScore = fuzzySimilarity(cleanedArtist, expectedArtist);
  const recordScore = fuzzySimilarity(record, expectedRecord);
  
  // console.debug(`Discogs match scores - Artist ${cleanedArtist}: ${artistScore.toFixed(3)}, Record ${record}: ${recordScore.toFixed(3)}`);
  // Weight record name slightly higher since artist names vary more
  return (artistScore * 0.4) + (recordScore * 0.6);
}

/**
 * Checks if a Discogs result matches the expected artist and record name.
 * @param {object} discogsResult - The result object from Discogs
 * @param {string} expectedArtist - The artist we're searching for
 * @param {string} expectedRecord - The record name we're searching for
 * @returns {boolean} True if the result matches the expected artist and record
 */
function doesDiscogsResultMatch(discogsResult, expectedArtist, expectedRecord) {
  // Use a threshold for "good enough" match
  return calculateMatchScore(discogsResult, expectedArtist, expectedRecord) >= 0.7;
}

/**
 * Searches Discogs by barcode and returns master release information
 * @async
 * @param {string} barcode - The product barcode to search
 * @returns {Promise<Object|null>} Master release info or null if not found
 */
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

    const { artist, record } = splitDiscogsTitle(prioritized?.title);
    const masterIdRaw = prioritized?.master_id;
    const masterIdNum = Number(masterIdRaw);
    const releaseIdNum = Number(prioritized?.id);
    // Use master_id as string if > 0, otherwise use 'r' + release id
    let masterId = null;
    if (Number.isInteger(masterIdNum) && masterIdNum > 0) {
      masterId = String(masterIdNum);
    } else if (Number.isInteger(releaseIdNum) && releaseIdNum > 0) {
      masterId = `r${releaseIdNum}`;
    }
    const releaseYear = normalizeDiscogsReleaseYear(prioritized?.year);
    const cover =
      typeof prioritized?.cover_image === "string" && prioritized.cover_image.trim()
        ? prioritized.cover_image.trim()
        : typeof prioritized?.thumb === "string" && prioritized.thumb.trim()
        ? prioritized.thumb.trim()
        : null;
    
    // Extract genres and styles from search result
    const genres = Array.isArray(prioritized?.genre) ? prioritized.genre : [];
    const styles = Array.isArray(prioritized?.style) ? prioritized.style : [];

    // Remove trailing (digit) from artist name
    const cleanedArtist = artist
      ? artist.replace(/\s*\(\d+\)\s*$/, "").trim()
      : null;

    return {
      masterId,
      artist: cleanedArtist || null,
      record: record || null,
      releaseYear,
      discogsCover: cover,
      genres,
      styles,
    };
  } catch (error) {
    console.warn("Discogs barcode lookup failed", error);
    throw error;
  }
}

/**
 * Searches Discogs for master release matching artist and record name
 * Uses fuzzy matching to find best result
 * @async
 * @param {string} artist - Artist name to search for
 * @param {string} record - Record name to search for
 * @returns {Promise<Object|null>} Master release info or null if not found
 */
async function lookupDiscogsMaster(artist, record) {
  const trimmedArtist = typeof artist === "string" ? artist.trim() : "";
  const trimmedRecord = typeof record === "string" ? record.trim() : "";
  if (!trimmedArtist || !trimmedRecord) {
    return null;
  }

  const requestUrl = buildDiscogsSearchUrl(trimmedArtist, trimmedRecord);
  //console.debug(`Discogs search URL: ${requestUrl}`);

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

    // Helper to extract masterId from a result (prefer master_id if > 0, else use 'r' + id)
    // Returns a string: either the master_id as string, or 'r' + release id
    const extractMasterId = (result) => {
      const masterIdVal = Number(result?.master_id);
      if (Number.isInteger(masterIdVal) && masterIdVal > 0) {
        return String(masterIdVal);
      }
      const idVal = Number(result?.id);
      return Number.isInteger(idVal) && idVal > 0 ? `r${idVal}` : null;
    };

    // Try to find a result that matches the artist and record name
    // First look for a "good enough" match (score >= 0.7)
    let matchingResult = results.find((result) =>
      doesDiscogsResultMatch(result, trimmedArtist, trimmedRecord)
    );

    // If no good match found, find the best scoring result
    if (!matchingResult) {
      let bestScore = 0;
      let bestResult = null;
      
      for (const result of results) {
        const score = calculateMatchScore(result, trimmedArtist, trimmedRecord);
        if (score > bestScore) {
          bestScore = score;
          bestResult = result;
        }
      }
      
      // Only use the best result if it has a reasonable score (>= 0.3)
      // Otherwise return no match
      if (bestScore >= 0.3) {
        console.log(
          `Best fuzzy match for "${trimmedArtist}" - "${trimmedRecord}" with score ${bestScore.toFixed(2)}: "${bestResult?.title}"`
        );
        matchingResult = bestResult;
      } else {
        console.log(
          `No good match found for "${trimmedArtist}" - "${trimmedRecord}" (best score: ${bestScore.toFixed(2)}), returning no match`
        );
        return null;
      }
    }

    // Use master_id if > 0, otherwise fall back to id
    const masterId = extractMasterId(matchingResult);
    const releaseYear = normalizeDiscogsReleaseYear(matchingResult?.year);
    const cover =
      typeof matchingResult?.cover_image === "string" && matchingResult.cover_image.trim()
        ? matchingResult.cover_image.trim()
        : typeof matchingResult?.thumb === "string" && matchingResult.thumb.trim()
        ? matchingResult.thumb.trim()
        : null;
    
    // Extract genres and styles from the search result
    const genres = Array.isArray(matchingResult?.genre) ? matchingResult.genre : [];
    const styles = Array.isArray(matchingResult?.style) ? matchingResult.style : [];

    return {
      masterId,
      releaseYear,
      cover,
      genres,
      styles,
    };
  } catch (error) {
    console.warn("Discogs lookup failed", error);
    throw error;
  }
}

/**
 * Fetches full master/release details from Discogs API including genres and styles.
 * masterId is a string: either a numeric ID (for master releases) or 'r' + numeric ID (for releases).
 */
async function fetchDiscogsMasterDetails(masterId) {
  if (typeof masterId !== "string" || !masterId) {
    return null;
  }

  // Determine if this is a release ID (prefixed with 'r') or a master ID
  const isRelease = masterId.startsWith("r");
  const numericId = isRelease ? masterId.slice(1) : masterId;
  
  // Validate that the numeric part is a valid positive integer
  const idNum = Number(numericId);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return null;
  }

  // Use the appropriate Discogs endpoint
  const endpoint = isRelease ? "releases" : "masters";
  const url = new URL(`https://api.discogs.com/${endpoint}/${numericId}`);
  if (DISCOGS_API_KEY && DISCOGS_API_SECRET) {
    url.searchParams.set("key", DISCOGS_API_KEY);
    url.searchParams.set("secret", DISCOGS_API_SECRET);
  }

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": DISCOGS_USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      console.warn(`Discogs ${endpoint} API returned ${response.status} for ${masterId}`);
      return null;
    }

    const data = await response.json();
    const genres = Array.isArray(data.genres) ? data.genres : [];
    const styles = Array.isArray(data.styles) ? data.styles : [];

    return { genres, styles };
  } catch (error) {
    console.warn(`Failed to fetch Discogs ${endpoint} ${masterId}`, error);
    return null;
  }
}

/**
 * Inserts genres and styles into MasterGenre table
 */
async function insertMasterGenres(pool, masterId, genres, styles) {
  if (!isValidMasterId(masterId)) {
    return;
  }

  const genresArray = Array.isArray(genres) ? genres : [];
  const stylesArray = Array.isArray(styles) ? styles : [];

  try {
    // Insert genres
    for (const genre of genresArray) {
      if (typeof genre === "string" && genre.trim()) {
        await pool.execute(
          `INSERT IGNORE INTO MasterGenre (masterId, genre, isStyle) VALUES (?, ?, ?)`,
          [masterId, genre.trim(), false]
        );
      }
    }

    // Insert styles
    for (const style of stylesArray) {
      if (typeof style === "string" && style.trim()) {
        await pool.execute(
          `INSERT IGNORE INTO MasterGenre (masterId, genre, isStyle) VALUES (?, ?, ?)`,
          [masterId, style.trim(), true]
        );
      }
    }
  } catch (error) {
    console.error(`Failed to insert genres for master ${masterId}`, error);
  }
}

/**
 * Syncs genres and styles in MasterGenre table - adds new ones and removes ones not in the provided arrays
 */
async function syncMasterGenres(pool, masterId, genres, styles) {
  if (!isValidMasterId(masterId)) {
    return;
  }

  const genresArray = Array.isArray(genres) ? genres : [];
  const stylesArray = Array.isArray(styles) ? styles : [];

  // Normalize to trimmed strings
  const normalizedGenres = genresArray
    .filter(g => typeof g === "string" && g.trim())
    .map(g => g.trim());
  const normalizedStyles = stylesArray
    .filter(s => typeof s === "string" && s.trim())
    .map(s => s.trim());

  // Skip if both arrays are empty (happens when loading master directly without Discogs data)
  if (normalizedGenres.length === 0 && normalizedStyles.length === 0) {
    return;
  }

  try {
    // Insert new genres (INSERT IGNORE will skip duplicates)
    for (const genre of normalizedGenres) {
      await pool.execute(
        `INSERT IGNORE INTO MasterGenre (masterId, genre, isStyle) VALUES (?, ?, ?)`,
        [masterId, genre, false]
      );
    }

    // Insert new styles
    for (const style of normalizedStyles) {
      await pool.execute(
        `INSERT IGNORE INTO MasterGenre (masterId, genre, isStyle) VALUES (?, ?, ?)`,
        [masterId, style, true]
      );
    }

    // Remove genres that are not in the provided list
    if (normalizedGenres.length > 0) {
      const placeholders = normalizedGenres.map(() => '?').join(',');
      await pool.execute(
        `DELETE FROM MasterGenre WHERE masterId = ? AND isStyle = FALSE AND genre NOT IN (${placeholders})`,
        [masterId, ...normalizedGenres]
      );
    } else {
      // If no genres provided, remove all genres (but keep styles)
      await pool.execute(
        `DELETE FROM MasterGenre WHERE masterId = ? AND isStyle = FALSE`,
        [masterId]
      );
    }

    // Remove styles that are not in the provided list
    if (normalizedStyles.length > 0) {
      const placeholders = normalizedStyles.map(() => '?').join(',');
      await pool.execute(
        `DELETE FROM MasterGenre WHERE masterId = ? AND isStyle = TRUE AND genre NOT IN (${placeholders})`,
        [masterId, ...normalizedStyles]
      );
    } else {
      // If no styles provided, remove all styles (but keep genres)
      await pool.execute(
        `DELETE FROM MasterGenre WHERE masterId = ? AND isStyle = TRUE`,
        [masterId]
      );
    }
  } catch (error) {
    console.error(`Failed to sync genres for master ${masterId}`, error);
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

  if (isValidMasterId(masterId)) {
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
  if (isValidMasterId(masterId)) {
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

/**
 * Retrieves list by ID with owner information
 * @async
 * @param {Object} pool - MySQL connection pool
 * @param {number} listId - The list ID
 * @returns {Promise<Object|null>} List object with owner data or null
 */
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

/**
 * Retrieves list by ID, verifying ownership by user
 * @async
 * @param {Object} pool - MySQL connection pool
 * @param {number} listId - The list ID
 * @param {string} userUuid - User UUID to verify ownership
 * @returns {Promise<Object|null>} List object if owned by user, null otherwise
 */
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

/**
 * Fetches detailed release information from Discogs API
 * @async
 * @param {number} releaseId - Discogs release ID
 * @returns {Promise<Object|null>} Release details or null if not found
 */
async function fetchDiscogsRelease(releaseId) {
  if (!releaseId) return null;
  const userAgent = process.env.DISCOGS_USER_AGENT || 'MyRecordCollection/1.0';
  const url = new URL(`https://api.discogs.com/releases/${releaseId}`);
  if (DISCOGS_API_KEY && DISCOGS_API_SECRET) {
    url.searchParams.set("key", DISCOGS_API_KEY);
    url.searchParams.set("secret", DISCOGS_API_SECRET);
  }
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
      },
    });
    if (!response.ok) {
      console.warn(`Discogs API returned ${response.status} for release ${releaseId}`);
      return null;
    }
    const data = await response.json();
    return {
      masterId: data.master_id || null,
      title: data.title || null,
      artists: data.artists || [],
      year: data.year || null,
    };
  } catch (err) {
    console.warn('Discogs release lookup failed', err);
    return null;
  }
}

async function fetchLastFmCover(artist, record) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return null;
  const query = `${record.trim()} ${artist.trim()}`; // search by record title only per request
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

    // normalize targets for comparison
    const targetArtist = (artist || "").toLowerCase().trim();
    const targetRecord = (record || "").toLowerCase().trim();

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
        const aName = (album?.name || "").toLowerCase().trim();
        if (aArtist && aArtist === targetArtist && aName === targetRecord) {
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

/**
 * Middleware to verify JWT authentication token
 * Sets req.userUuid if token is valid
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
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

/**
 * Middleware to verify admin privileges
 * Checks if user has admin permissions in the database
 * @async
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
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

/**
 * GET /api/records
 * Retrieves all records for the authenticated user from a specific collection
 * Query params: table (collection name)
 * @returns {Object} records array and collection privacy settings
 */
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

/**
 * GET /api/users/:username/records
 * Retrieves all records for a user's collection(s)
 * Respects collection privacy settings based on authentication
 * @returns {Object} records array with user information
 */
app.get("/api/users/:username/records", async (req, res) => {
  const targetUsername = req.params.username;
  console.log(`Fetching all records for user: ${targetUsername}`);
  
  let authenticatedUserUuid = null;
  const token = req.cookies?.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload && typeof payload.userUuid === "string") {
        authenticatedUserUuid = payload.userUuid;
      }
    } catch {
      // ignore invalid tokens
    }
  }

  try {
    const pool = await getPool();
    
    // Get target user info
    const targetUser = await getUserByUsername(pool, targetUsername);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const targetUserUuid = targetUser.uuid;
    const isOwnRecords = authenticatedUserUuid === targetUserUuid;
    
    // Build query based on privacy
    let query;
    let params;
    
    if (isOwnRecords) {
      // User requesting their own records - return all
      query = `
        SELECT r.id, r.name as record, r.artist, r.cover, r.rating, 
               r.release_year as 'release', r.added as added, r.tableId, 
               r.isCustom as isCustom, r.masterId as masterId,
               t.name as collectionName
        FROM Record r
        LEFT JOIN RecTable t ON r.tableId = t.id
        WHERE r.userUuid = ?
        ORDER BY r.name
      `;
      params = [targetUserUuid];
    } else {
      // Another user requesting - only return records from public collections
      query = `
        SELECT r.id, r.name as record, r.artist, r.cover, r.rating, 
               r.release_year as 'release', r.added as added, r.tableId, 
               r.isCustom as isCustom, r.masterId as masterId, r.review as review,
               t.name as collectionName
        FROM Record r
        LEFT JOIN RecTable t ON r.tableId = t.id
        WHERE r.userUuid = ? AND t.isPrivate = 0
        ORDER BY r.added DESC
      `;
      params = [targetUserUuid];
    }
    
    const [rows] = await pool.query(query, params);
    
    if (!rows || rows.length === 0) {
      return res.json({ records: [] });
    }
    
    // Fetch tags for all records
    const recordIds = rows.map((r) => r.id);
    const tagsByRecord = {};
    
    if (recordIds.length > 0) {
      const placeholders = recordIds.map(() => "?").join(", ");
      const [tagRows] = await pool.query(
        `SELECT t.name, tg.recordId 
         FROM Tag t 
         JOIN Tagged tg ON t.id = tg.tagId 
         WHERE tg.recordId IN (${placeholders})`,
        recordIds
      );
      
      for (const tr of tagRows) {
        const rid = tr.recordId;
        tagsByRecord[rid] = tagsByRecord[rid] || [];
        tagsByRecord[rid].push(tr.name);
      }
    }
    
    const records = rows.map((r) => ({
      ...r,
      tags: tagsByRecord[r.id] || [],
    }));
    
    res.json({ records });
  } catch (err) {
    console.error("Failed to fetch user records", err);
    res.status(500).json({ error: "Failed to fetch records" });
  }
});

/**
 * GET /api/compare/:username
 * Compares authenticated user's record collection with another user's collection
 * @param {string} username - Username to compare with
 * @returns {Object} Comparison data (records in common, unique to each user)
 */
app.get("/api/compare/:username", async (req, res) => {
  const targetUsername = req.params.username;
  console.log(`Comparing collections with user: ${targetUsername}`);
  
  // Get authenticated user
  let authenticatedUserUuid = null;
  const token = req.cookies?.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload && typeof payload.userUuid === "string") {
        authenticatedUserUuid = payload.userUuid;
      }
    } catch {
      return res.status(401).json({ error: "Authentication required" });
    }
  } else {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const pool = await getPool();
    
    // Get target user info
    const targetUser = await getUserByUsername(pool, targetUsername);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const targetUserUuid = targetUser.uuid;
    
    if (authenticatedUserUuid === targetUserUuid) {
      return res.status(400).json({ error: "Cannot compare with yourself" });
    }
    
    // Find shared records by matching masterId
    // Only include records from public collections for both users
    // Return ALL records without filtering by collection type
    const query = `
      SELECT 
        r1.id as myRecordId,
        r1.masterId,
        m.name as record,
        m.artist,
        m.cover,
        r1.rating as myRating,
        t1.name as myCollection,
        MAX(r2.rating) as theirRating,
        MAX(t2.name) as theirCollection
      FROM Record r1
      INNER JOIN RecTable t1 ON r1.tableId = t1.id
      INNER JOIN Record r2 ON r1.masterId = r2.masterId
      INNER JOIN RecTable t2 ON r2.tableId = t2.id
      LEFT JOIN Master m ON r1.masterId = m.id
      WHERE r1.userUuid = ? 
        AND r2.userUuid = ?
        AND r1.masterId IS NOT NULL
        AND r2.masterId IS NOT NULL
        AND t1.isPrivate = 0
        AND t2.isPrivate = 0
      GROUP BY r1.id, r1.masterId, m.name, m.artist, m.cover, r1.rating, t1.name
      ORDER BY m.name
    `;
    
    const [rows] = await pool.query(query, [authenticatedUserUuid, targetUserUuid]);
    
    const comparedRecords = rows.map((r) => ({
      id: r.myRecordId,
      masterId: r.masterId,
      record: r.record,
      artist: r.artist,
      cover: r.cover,
      myRating: r.myRating || 0,
      theirRating: r.theirRating || 0,
      myCollection: r.myCollection,
      theirCollection: r.theirCollection,
    }));
    
    res.json({ records: comparedRecords });
  } catch (err) {
    console.error("Failed to compare collections", err);
    res.status(500).json({ error: "Failed to compare collections" });
  }
});

/**
 * GET /api/compare/:username/genres
 * Compares genre interests between authenticated user and target user
 * @param {string} username - Username of the user to compare with
 * @returns {Object} Comparison data showing shared genres and differences
 */
app.get("/api/compare/:username/genres", async (req, res) => {
  const targetUsername = req.params.username;
  console.log(`Comparing genre interests with user: ${targetUsername}`);
  
  // Get authenticated user
  let authenticatedUserUuid = null;
  const token = req.cookies?.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload && typeof payload.userUuid === "string") {
        authenticatedUserUuid = payload.userUuid;
      }
    } catch {
      return res.status(401).json({ error: "Authentication required" });
    }
  } else {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const pool = await getPool();
    
    // Get target user info
    const targetUser = await getUserByUsername(pool, targetUsername);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const targetUserUuid = targetUser.uuid;
    
    if (authenticatedUserUuid === targetUserUuid) {
      return res.status(400).json({ error: "Cannot compare with yourself" });
    }
    
    // Fetch authenticated user's genre interests (only genres, not styles) for all tables
    const [myGenres] = await pool.query(
      `SELECT genre, rating, collectionPercent, tableName
       FROM UserGenreInterest 
       WHERE userUuid = ? AND isStyle = FALSE
       ORDER BY tableName, genre`,
      [authenticatedUserUuid]
    );
    
    // Fetch target user's genre interests (only genres, not styles) for all tables
    const [theirGenres] = await pool.query(
      `SELECT genre, rating, collectionPercent, tableName
       FROM UserGenreInterest 
       WHERE userUuid = ? AND isStyle = FALSE
       ORDER BY tableName, genre`,
      [targetUserUuid]
    );
    
    // Group by table name
    const myGenresByTable = {
      "All": [],
      "My Collection": [],
      "Wishlist": [],
      "Listened": []
    };
    
    const theirGenresByTable = {
      "All": [],
      "My Collection": [],
      "Wishlist": [],
      "Listened": []
    };
    
    for (const row of myGenres) {
      const tableName = row.tableName;
      if (myGenresByTable[tableName]) {
        myGenresByTable[tableName].push({
          genre: row.genre,
          rating: row.rating,
          collectionPercent: Number(row.collectionPercent) || 0
        });
      }
    }
    
    for (const row of theirGenres) {
      const tableName = row.tableName;
      if (theirGenresByTable[tableName]) {
        theirGenresByTable[tableName].push({
          genre: row.genre,
          rating: row.rating,
          collectionPercent: Number(row.collectionPercent) || 0
        });
      }
    }
    
    res.json({ 
      myGenresByTable,
      theirGenresByTable
    });
  } catch (err) {
    console.error("Failed to compare genre interests", err);
    res.status(500).json({ error: "Failed to compare genre interests" });
  }
});

/**
 * GET /api/records/master-info
 * Retrieves metadata for a Discogs master record including genres and styles
 * Query params: masterId, artist, record (for lookup)
 * @returns {Object} Master record info with genres and styles
 */
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

  const masterIdParam = parseMasterId(req.query.masterId);
  const hasMasterId = isValidMasterId(masterIdParam);

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
        // Master ID exists but not in our database yet - fetch details from Discogs
        // Determine if this is a release ID (prefixed with 'r') or a master ID
        const isRelease = masterIdParam.startsWith("r");
        const numericId = isRelease ? masterIdParam.slice(1) : masterIdParam;
        const discogsEndpoint = isRelease ? "releases" : "masters";
        try {
          const discogsUrl = `https://api.discogs.com/${discogsEndpoint}/${numericId}`;
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
            const artist = typeof discogsData?.artists?.[0]?.name === "string" ? cleanDiscogsArtist(discogsData.artists[0].name) : null;
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
      `SELECT name, artist, cover, ratingAve, rating1, rating2, rating3, rating4, rating5, rating6, rating7, rating8, rating9, rating10, release_year
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
    
    // Use DB name/artist/cover if master is in database, otherwise use search/Discogs values
    const finalName = ratingAveRow && typeof ratingAveRow.name === "string" && ratingAveRow.name.trim()
      ? ratingAveRow.name.trim()
      : recordName;
    const finalArtist = ratingAveRow && typeof ratingAveRow.artist === "string" && ratingAveRow.artist.trim()
      ? ratingAveRow.artist.trim()
      : artist;
    const finalCover = ratingAveRow && typeof ratingAveRow.cover === "string" && ratingAveRow.cover.trim()
      ? ratingAveRow.cover.trim()
      : result.cover;
    
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
      cover: finalCover,
      ratingCounts,
      record: finalName,
      artist: finalArtist,
      userCollections,
      userLists,
      inDb: !!ratingAveRow,
      genres: result.genres || [],
      styles: result.styles || [],
    });
  } catch (error) {
    console.error("Failed to load master info", error);
    res.status(502).json({ error: "Failed to fetch master information" });
  }
});

/**
 * POST /api/barcode_search
 * Searches Discogs by barcode and returns record information
 * @returns {Object} Record info (artist, title, cover, genres, masterId) or null
 */
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

/**
 * GET /api/records/master-reviews
 * Retrieves reviews for a Discogs master record from user collection
 * Query params: masterId
 * @returns {Array} Reviews and ratings from users who own this record
 */
app.get("/api/records/master-reviews", async (req, res) => {
  console.log("Fetching master reviews...");

  const masterId = parseMasterId(req.query.masterId);
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

/**
 * GET /api/community/search
 * Searches for users by username or display name
 * Query params: q (search query), limit, offset
 * @returns {Array} Matching user profiles
 */
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

/**
 * GET /api/community/users/:username
 * Retrieves public profile for a community user
 * @param {string} username - Target username
 * @returns {Object} Public user profile with collection stats
 */
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
  `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review, t.name as tableName
       FROM Record r
       JOIN RecTable t ON r.tableId = t.id
       WHERE r.userUuid = ?
       ORDER BY r.added DESC
       LIMIT ?`,
        [userRow.uuid, PROFILE_RECENT_PREVIEW_LIMIT]
      );

      const recentRecordIds = recentRows.map((row) => row.id);
      const tagsByRecord = await fetchTagsByRecordIds(pool, recentRecordIds);
      recentRecords = recentRows.map((row) => ({
        ...row,
        tags: tagsByRecord[row.id] || [],
      }));
    }

    let collectionCount = 0;
    if (defaultCollectionRow && (!collectionPrivate || isOwner)) {
      const [collectionCountRows] = await pool.query(
        `SELECT COUNT(*) as count
         FROM Record r
         JOIN RecTable t ON r.tableId = t.id
         WHERE r.userUuid = ? AND t.name = ?`,
        [userRow.uuid, DEFAULT_COLLECTION_NAME]
      );
      collectionCount = collectionCountRows[0]?.count || 0;
    }

    let wishlistCount = 0;
    if (wishlistRow && (!wishlistPrivate || isOwner)) {
      const [wishlistCountRows] = await pool.query(
        `SELECT COUNT(*) as count
         FROM Record r
         JOIN RecTable t ON r.tableId = t.id
         WHERE r.userUuid = ? AND t.name = ?`,
        [userRow.uuid, WISHLIST_COLLECTION_NAME]
      );
      wishlistCount = wishlistCountRows[0]?.count || 0;
    }

    let listenedCount = 0;
    if (listenedRow && (!listenedPrivate || isOwner)) {
      const [listenedCountRows] = await pool.query(
        `SELECT COUNT(*) as count
         FROM Record r
         JOIN RecTable t ON r.tableId = t.id
         WHERE r.userUuid = ? AND t.name = ?`,
        [userRow.uuid, LISTENED_COLLECTION_NAME]
      );
      listenedCount = listenedCountRows[0]?.count || 0;
    }

    // Fetch listening to record
    let listeningTo = null;
    const [listeningToRows] = await pool.query(
      `SELECT m.artist, m.cover, m.name, lt.masterId 
       FROM ListeningTo lt
       JOIN Master m ON m.id = lt.masterId
       WHERE lt.userUuid = ? LIMIT 1`,
      [userRow.uuid]
    );
    if (listeningToRows && listeningToRows.length > 0) {
      const row = listeningToRows[0];
      listeningTo = {
        artist: typeof row.artist === 'string' && row.artist.trim() ? row.artist.trim() : null,
        cover: typeof row.cover === 'string' && row.cover.trim() ? row.cover.trim() : null,
        name: typeof row.name === 'string' ? row.name : '',
        masterId: parseMasterId(row.masterId),
      };
    }

    res.json({
      ...publicUser,
      highlights,
      recentRecords,
      isFollowing,
      collectionCount,
      collectionPrivate,
      wishlistCount,
      wishlistPrivate,
      listenedCount,
      listenedPrivate,
      listeningTo,
    });
  } catch (error) {
    console.error("Failed to load public profile", error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

/**
 * GET /api/community/users/:username/collection
 * Retrieves a user's public record collection if privacy settings allow
 * @param {string} username - Username of the profile owner
 * @returns {Array} Records in user's collection
 */
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

/**
 * GET /api/community/users/:username/wishlist
 * Retrieves a user's public wishlist
 * @param {string} username - Target username
 * @returns {Array} Records in user's wishlist
 */
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

/**
 * GET /api/community/users/:username/genre/:genreName
 * Retrieves records by a specific genre from a user's collection (if public)
 * @param {string} username - Username of the profile owner
 * @param {string} genreName - Name of the genre
 * @query {string} [t] - Collection table name (My Collection, Wishlist, Listened, etc.)
 * @returns {Array} Records in the genre
 */
app.get(
  "/api/community/users/:username/genre/:genreName",
  async (req, res) => {
    const targetUsername = req.params.username;
    const genreName = req.params.genreName;
    const tableName = typeof req.query.t === "string" ? req.query.t : null;
    console.log(`Fetching ${targetUsername}'s collection by genre '${genreName}'${tableName ? ` in table '${tableName}'` : ''}...`);
    
    if (!targetUsername) {
      return res.status(400).json({ error: "Username is required" });
    }
    
    if (!genreName) {
      return res.status(400).json({ error: "Genre is required" });
    }
    
    // Validate table name if provided
    if (tableName && !["My Collection", "Wishlist", "Listened"].includes(tableName)) {
      return res.status(400).json({ error: "Invalid table name" });
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

      // Get all three tables (Collection, Wishlist, Listened) for the user
      const [collectionTable, wishlistTable, listenedTable] = await Promise.all([
        getUserTableRow(pool, userRow.uuid, DEFAULT_COLLECTION_NAME),
        getUserTableRow(pool, userRow.uuid, WISHLIST_COLLECTION_NAME),
        getUserTableRow(pool, userRow.uuid, LISTENED_COLLECTION_NAME),
      ]);

      const isOwner = authenticatedUserUuid && userRow.uuid === authenticatedUserUuid;
      
      // Build a list of accessible table IDs, optionally filtered by tableName
      const tableIds = [];
      if (!tableName || tableName === "My Collection") {
        if (collectionTable && (!collectionTable.isPrivate || isOwner)) {
          tableIds.push(collectionTable.id);
        }
      }
      if (!tableName || tableName === "Wishlist") {
        if (wishlistTable && (!wishlistTable.isPrivate || isOwner)) {
          tableIds.push(wishlistTable.id);
        }
      }
      if (!tableName || tableName === "Listened") {
        if (listenedTable && (!listenedTable.isPrivate || isOwner)) {
          tableIds.push(listenedTable.id);
        }
      }

      if (tableIds.length === 0) {
        return res.json([]);
      }

      // Query records that match the genre (join with MasterGenre where isStyle = 0)
      const placeholders = tableIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT DISTINCT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', 
                r.added as added, r.tableId, r.isCustom as isCustom, r.masterId as masterId, r.review as review
         FROM Record r
         INNER JOIN MasterGenre mg ON r.masterId = mg.masterId
         WHERE r.userUuid = ? 
           AND r.tableId IN (${placeholders})
           AND mg.genre = ?
           AND mg.isStyle = FALSE
         ORDER BY r.added DESC`,
        [userRow.uuid, ...tableIds, genreName]
      );

      const recordIds = rows.map((row) => row.id);
      const tagsByRecord = await fetchTagsByRecordIds(pool, recordIds);
      const response = rows.map((row) => ({
        ...row,
        tags: tagsByRecord[row.id] || [],
      }));
      res.json(response);
    } catch (error) {
      console.error("Failed to load collection by genre", error);
      res.status(500).json({ error: "Failed to load collection by genre" });
    }
  }
);

/**
 * GET /api/community/users/:username/follows
 * Retrieves list of users that a community user is following
 */
app.get(
  "/api/community/users/:username/follows",
  async (req, res) => {
    console.log("Fetching followers/following...");
    const targetUsername = req.params.username;
    if (!targetUsername) {
      return res.status(400).json({ error: "Username is required" });
    }

    const limit = req.query.limit ? Number.parseInt(req.query.limit, 10) : null;
    const followersOffset = req.query.followersOffset ? Number.parseInt(req.query.followersOffset, 10) : 0;
    const followingOffset = req.query.followingOffset ? Number.parseInt(req.query.followingOffset, 10) : 0;

    try {
      const pool = await getPool();
      const userRow = await getUserByUsername(pool, targetUsername);
      if (!userRow) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get total counts
      const [[{ followersTotal }]] = await pool.query(
        `SELECT COUNT(*) as followersTotal FROM Follows WHERE followsUuid = ?`,
        [userRow.uuid]
      );
      const [[{ followingTotal }]] = await pool.query(
        `SELECT COUNT(*) as followingTotal FROM Follows WHERE userUuid = ?`,
        [userRow.uuid]
      );

      const [followers, following] = await Promise.all([
        getFollowersForUser(pool, userRow.uuid, limit, followersOffset),
        getFollowingForUser(pool, userRow.uuid, limit, followingOffset),
      ]);

      res.json({ 
        followers, 
        following,
        followersTotal: Number(followersTotal),
        followingTotal: Number(followingTotal),
        followersHasMore: limit !== null && followersOffset + followers.length < followersTotal,
        followingHasMore: limit !== null && followingOffset + following.length < followingTotal
      });
    } catch (error) {
      console.error("Failed to load follows", error);
      res.status(500).json({ error: "Failed to load follows" });
    }
  }
);

/**
 * GET /api/community/users/:username/genre-interests
 * Retrieves a user's genre interests/preferences from their collections
 * @param {string} username - Username of the profile owner
 * @returns {Object} Genre statistics and interests for all collections
 */
app.get(
  "/api/community/users/:username/genre-interests",
  async (req, res) => {
    const targetUsername = req.params.username;
    console.log(`Fetching ${targetUsername}'s genre interests for all tables...`);
    
    if (!targetUsername) {
      return res.status(400).json({ error: "Username is required" });
    }

    try {
      const pool = await getPool();
      const userRow = await getUserByUsername(pool, targetUsername);
      if (!userRow) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get all genre interests from UserGenreInterest table (all tables at once)
      const [rows] = await pool.query(
        `SELECT genre, rating, collectionPercent, recordCount, tableName
         FROM UserGenreInterest
         WHERE userUuid = ?
         ORDER BY tableName, collectionPercent DESC`,
        [userRow.uuid]
      );

      // Group genres by table name
      const genresByTable = {
        "All": [],
        "My Collection": [],
        "Wishlist": [],
        "Listened": []
      };

      for (const row of rows) {
        const tableName = row.tableName;
        if (genresByTable[tableName]) {
          genresByTable[tableName].push({
            genre: row.genre,
            rating: row.rating !== null ? Number(row.rating) : null,
            collectionPercent: Number(row.collectionPercent),
            recordCount: Number(row.recordCount) || 0,
          });
        }
      }

      res.json({
        genresByTable,
        displayName: userRow.displayName || userRow.username,
        profilePicUrl: buildProfilePicPublicPath(userRow.profilePic) || null,
      });
    } catch (error) {
      console.error("Failed to load genre interests", error);
      res.status(500).json({ error: "Failed to load genre interests" });
    }
  }
);

/**
 * GET /api/activity
 * Retrieves recent activity feed for authenticated user
 * Shows record additions and other user activities
 * @returns {Array} Activity entries with timestamps
 */
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
    let recordRows, listRows, likedReviewRows, likedListRows, listeningToRows;

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
      // Get listening to from followed users
      [listeningToRows] = await pool.query(
        `SELECT 'listening-to' as activityType, lt.created as timestamp, lt.masterId,
                m.name as recordName, m.artist, m.cover,
                u.username as listenerUsername, u.displayName as listenerDisplayName, u.profilePic as listenerProfilePic
           FROM ListeningTo lt
           JOIN Follows f ON f.followsUuid = lt.userUuid
           JOIN User u ON u.uuid = lt.userUuid
           JOIN Master m ON m.id = lt.masterId
          WHERE f.userUuid = ?`,
        [req.userUuid]
      );
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
      // Get user's own listening to
      [listeningToRows] = await pool.query(
        `SELECT 'listening-to' as activityType, lt.created as timestamp, lt.masterId,
                m.name as recordName, m.artist, m.cover,
                u.username as listenerUsername, u.displayName as listenerDisplayName, u.profilePic as listenerProfilePic
           FROM ListeningTo lt
           JOIN User u ON u.uuid = lt.userUuid
           JOIN Master m ON m.id = lt.masterId
          WHERE lt.userUuid = ?`,
        [req.userUuid]
      );
    }

    // Combine and sort all activity
    const allActivity = [
      ...(Array.isArray(recordRows) ? recordRows : []),
      ...(Array.isArray(listRows) ? listRows : []),
      ...(Array.isArray(likedReviewRows) ? likedReviewRows : []),
      ...(Array.isArray(likedListRows) ? likedListRows : []),
      ...(Array.isArray(listeningToRows) ? listeningToRows : [])
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
      // Handle listening-to activity
      if (row.activityType === 'listening-to') {
        const listenerDisplayName =
          typeof row.listenerDisplayName === "string" && row.listenerDisplayName.trim()
            ? row.listenerDisplayName.trim()
            : null;
        
        return {
          type: 'listening-to',
          listener: {
            username: row.listenerUsername,
            displayName: listenerDisplayName,
            profilePicUrl: buildProfilePicPublicPath(row.listenerProfilePic),
          },
          record: {
            masterId: row.masterId,
            name: row.recordName,
            artist: row.artist,
            cover:
              typeof row.cover === 'string' && row.cover.trim()
                ? row.cover.trim()
                : null,
          },
          listeningAt: row.timestamp,
        };
      }

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
      const masterId = parseMasterId(row.masterId);
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

    res.json(feed);
  } catch (error) {
    console.error("Failed to load activity feed", error);
    res.status(500).json({ error: "Failed to load feed" });
  }
});

/**
 * GET /api/tags
 * Retrieves all tags for the authenticated user
 * @returns {Array} Tag objects with names and frequencies
 */
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

/**
 * POST /api/community/users/:username/follow
 * Follows a user (authenticated user follows target username)
 * @param {string} username - Username of the user to follow
 * @returns {Object} {success: true} or error message
 */
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

/**
 * DELETE /api/community/users/:username/follow
 * Unfollows a user (authenticated user unfollows target username)
 * @param {string} username - Username of the user to unfollow
 * @returns {Object} {success: true} or error message
 */
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

/**
 * POST /api/register
 * Creates a new user account with validation
 * Sets authentication cookie on success
 * @returns {Object} {success: true} or error message
 */
// Register endpoint
app.post('/api/register', async (req, res) => {
  console.log("Registering user...");
  const { username, password, email, displayName: rawDisplayName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
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
  
  // Validate email format
  const emailValue = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailValue)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }
  
  try {
    const pool = await getPool();
    
    // Check if email already exists
    const [emailRows] = await pool.execute(
      'SELECT uuid FROM User WHERE email = ?',
      [emailValue]
    );
    if (emailRows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const userUuid = uuidv4();
    const displayName =
      typeof rawDisplayName === "string" && rawDisplayName.trim()
        ? rawDisplayName.trim().slice(0, 50)
        : username;
    
    await pool.execute(
      'INSERT INTO User (uuid, username, displayName, password, email, bio, profilePic, created) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
      [userUuid, username.toLowerCase(), displayName, hashedPassword, emailValue, null, null]
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
      if (err.message.includes('email')) {
        return res.status(409).json({ error: 'Email already registered.' });
      }
      return res.status(409).json({ error: 'Username already exists.' });
    }
    res.status(500).json({ error: 'Registration failed.' });
  }
});

/**
 * POST /api/login
 * Authenticates user with username/email and password
 * Sets secure HTTP-only authentication cookie on success
 * @returns {Object} {success: true} or error message
 */
// Login endpoint
app.post('/api/login', async (req, res) => {
  console.log("Logging in...");
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username/email and password required.' });
  }
  try {
    const pool = await getPool();
    // Check if input is email or username
    const isEmail = username.includes('@');
    const [rows] = await pool.execute(
      isEmail 
        ? 'SELECT uuid, password FROM User WHERE email = ?'
        : 'SELECT uuid, password FROM User WHERE username = ?',
      [isEmail ? username : username.toLowerCase()]
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

/**
 * POST /api/logout
 * Clears authentication cookie
 * @returns {Object} {success: true}
 */
// Logout endpoint
app.post('/api/logout', (req, res) => {
  console.log("Logging out...");
  res.clearCookie('token', { httpOnly: true, sameSite: process.env.CROSS_SITE_COOKIES === 'true' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ success: true });
});

/**
 * GET /api/me
 * Retrieves current authenticated user's profile information
 * Requires valid JWT authentication
 * @returns {Object} User profile with permissions and follow counts
 */
app.get('/api/me', requireAuth, async (req, res) => {
  console.log("Fetching user info...");
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(
      `SELECT u.username,
              u.email,
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

    // For admins, check if there are any pending reports (efficient EXISTS query)
    let hasPendingReports = false;
    if (isAdmin) {
      try {
        const [pendingCheck] = await pool.execute(
          `SELECT EXISTS(SELECT 1 FROM Report WHERE status = 'Pending') AS hasPending`
        );
        hasPendingReports = Boolean(pendingCheck[0]?.hasPending);
      } catch (pendingErr) {
        // Table may not exist yet, ignore the error
        console.warn('Could not check pending reports:', pendingErr.message);
      }
    }

    res.json({
      username: userRow.username,
      email: userRow.email ?? null,
      displayName: userRow.displayName,
      bio: userRow.bio ?? null,
      profilePicUrl,
      userUuid: req.userUuid,
      followersCount,
      followingCount,
      joinedDate: normalizeDateOnly(userRow.created),
      isAdmin,
      adminPermissions,
      hasPendingReports,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

/**
 * PATCH /api/profile
 * Updates user profile information (username, display name, bio)
 * @returns {Object} Updated user profile data
 */
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

/**
 * POST /api/profile/avatar
 * Uploads a new profile picture for the authenticated user
 * Removes previous picture if exists
 * @returns {Object} Success status and new profile picture URL
 */
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

/**
 * POST /api/profile/password
 * Changes the authenticated user's password
 * @returns {Object} {success: true} or error
 */
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

/**
 * POST /api/profile/email
 * Changes the authenticated user's email address
 * @returns {Object} {success: true} or error
 */
app.post('/api/profile/email', requireAuth, async (req, res) => {
  console.log("Changing email...");
  const { email, password } = req.body || {};
  
  // Password is always required
  if (!password) {
    return res.status(400).json({ error: 'Password is required to change email.' });
  }

  // Email is required
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailValue = email.trim();
  
  if (!emailRegex.test(emailValue)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  try {
    const pool = await getPool();
    
    // Verify password
    const [userRows] = await pool.execute('SELECT password FROM User WHERE uuid = ?', [req.userUuid]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const hash = userRows[0].password;
    const matches = await bcrypt.compare(password, hash);
    if (!matches) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    // Check if email is already taken by another user
    const [emailRows] = await pool.execute('SELECT uuid FROM User WHERE email = ? AND uuid != ?', [emailValue, req.userUuid]);
    if (emailRows.length > 0) {
      return res.status(409).json({ error: 'Email already in use by another account.' });
    }

    // Update email
    await pool.execute('UPDATE User SET email = ? WHERE uuid = ?', [emailValue, req.userUuid]);
    res.json({ success: true });
  } catch (err) {
    console.error('Email change failed', err);
    res.status(500).json({ error: 'Failed to change email' });
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
/**
 * GET /api/records/:id
 * Retrieves a single record by ID
 * Supports both authenticated user's own records and public records when username query param is provided
 * @param {number} id - Record ID
 * @query {string} [username] - Optional username to check public records
 * @returns {Object} Record object with full details
 */
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

/**
 * POST /api/records/:id/review/like
 * Adds a like to a record's review
 * @param {number} id - Record ID
 * @returns {Object} Updated like count
 */
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

/**
 * DELETE /api/records/:id/review/like
 * Removes a like from a record's review
 * @param {number} id - Record ID
 * @returns {Object} Updated like count
 */
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

/**
 * POST /api/records/update
 * Updates an existing record with new information, tags, and rating
 * @returns {Object} Updated record object
 */
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
      const truncatedTag = String(tagName).trim().slice(0, 50);
      if (!truncatedTag) continue;
      let [tagRows] = await pool.execute(`SELECT id FROM Tag WHERE name = ? AND userUuid = ?`, [truncatedTag, req.userUuid]);
      let tagId;
      if (tagRows.length === 0) {
        const [result] = await pool.execute(`INSERT INTO Tag (name, userUuid, created) VALUES (?, ?, UTC_TIMESTAMP())`, [truncatedTag, req.userUuid]);
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

/**
 * POST /api/records/create
 * Creates a new record in the specified collection
 * Automatically links to Discogs master release if found
 * @returns {Object} Created record object with ID
 */
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

  const masterId = parseMasterId(req.body?.masterId);
  const hasMaster = isValidMasterId(masterId);

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
  
  // Extract genres and styles from request body
  const genres = Array.isArray(req.body?.genres) ? req.body.genres : [];
  const styles = Array.isArray(req.body?.styles) ? req.body.styles : [];

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
      
      // Sync genres and styles (add new ones and remove ones not in the list)
      await syncMasterGenres(pool, masterId, genres, styles);
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
      const truncatedTag = String(tagName).trim().slice(0, 50);
      if (!truncatedTag) continue;
      let [tagRows] = await pool.execute(`SELECT id FROM Tag WHERE name = ? AND userUuid = ?`, [truncatedTag, req.userUuid]);
      let tagId;
      if (tagRows.length === 0) {
        const [tagResult] = await pool.execute(`INSERT INTO Tag (name, userUuid, created) VALUES (?, ?, UTC_TIMESTAMP())`, [truncatedTag, req.userUuid]);
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

/**
 * POST /api/tags/create
 * Creates a new tag for the authenticated user
 * @returns {Object} Created tag object with ID and name
 */
app.post('/api/tags/create', requireAuth, async (req, res) => {
  console.log('Creating tag...');
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tag name required' });
  try {
    const pool = await getPool();
    const trimmed = name.trim().slice(0, 50);
    if (trimmed.length === 0) return res.status(400).json({ error: 'Tag name required' });
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

/**
 * POST /api/tags/rename
 * Renames an existing tag for the authenticated user
 * @returns {Object} Success status
 */
app.post('/api/tags/rename', requireAuth, async (req, res) => {
  console.log('Renaming tag...');
  const { oldName, newName, tagId } = req.body;
  if (!newName) return res.status(400).json({ error: 'newName required' });
  try {
    const pool = await getPool();
    const trimmedNew = String(newName).trim().slice(0, 50);
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

/**
 * POST /api/tags/delete
 * Deletes a tag and removes it from all records
 * @returns {Object} Success status
 */
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

/**
 * POST /api/records/delete
 * Deletes a record from the user's collection
 * @returns {Object} Success status
 */
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

/**
 * POST /api/import/discogs
 * Imports user's Discogs collection into app
 * @returns {Object} Import results and statistics
 */
app.post('/api/import/discogs', requireAuth, async (req, res) => {
  const { records, tableName } = req.body || {};
  console.log('Importing Discogs collection of', Array.isArray(records) ? records.length : 0, 'records...');
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
    const masterCache = new Map();
    const usedMasterIds = new Set();
    let lastDiscogsCall = 0;

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

      const releaseId = typeof raw.releaseId === 'string' ? raw.releaseId.trim() : null;

      const tagsArray = Array.isArray(raw.tags) ? raw.tags : [];
      const cleanTags = Array.from(
        new Set(
          tagsArray
            .filter((tag) => typeof tag === 'string')
            .map((tag) => tag.trim().slice(0, 50))
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

      // Try to find or create master ID
      let masterId = null;
      let isCustom = true;
      
      // First, check if a master already exists in the database with matching name and artist
      const [existingMasterRows] = await pool.execute(
        `SELECT id FROM Master WHERE LOWER(name) = ? AND LOWER(artist) = ? LIMIT 1`,
        [recordName.toLowerCase(), artist.toLowerCase()]
      );
      
      if (existingMasterRows.length > 0) {
        // Found existing master - check if already used in this import
        const existingMasterId = existingMasterRows[0].id;
        if (usedMasterIds.has(existingMasterId)) {
          masterId = null;
          isCustom = true;
        } else {
          masterId = existingMasterId;
          isCustom = false;
          usedMasterIds.add(existingMasterId);
        }
      } else if (releaseId) {
        // No existing master found, try to fetch from Discogs if releaseId is provided
        // Rate limit: wait at least 2 seconds between Discogs API calls
        const now = Date.now();
        const timeSinceLastCall = now - lastDiscogsCall;
        if (timeSinceLastCall < 2000) {
          await new Promise(resolve => setTimeout(resolve, 2000 - timeSinceLastCall));
        }
        lastDiscogsCall = Date.now();
        
        const discogsData = await fetchDiscogsRelease(releaseId);
        if (discogsData && discogsData.masterId) {
          const discogsMasterId = discogsData.masterId;
          
          // Check if this master ID has already been used in this import batch
          if (usedMasterIds.has(discogsMasterId)) {
            console.log(`Skipping duplicate master ${discogsMasterId} for ${artist} - ${recordName}, marking as custom`);
            // This master was already used, so treat this record as custom
            masterId = null;
            isCustom = true;
          } else {
            // Check if master already exists in our database
            if (!masterCache.has(discogsMasterId)) {
              const [masterRows] = await pool.execute(
                `SELECT id FROM Master WHERE id = ? LIMIT 1`,
                [discogsMasterId]
              );
              if (masterRows.length > 0) {
                masterCache.set(discogsMasterId, masterRows[0].id);
              } else {
                // Master doesn't exist, create it
                const masterCover = await fetchLastFmCover(artist, recordName);
                const [masterInsert] = await pool.execute(
                  `INSERT INTO Master (id, name, artist, cover, release_year, created) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
                  [discogsMasterId, recordName, artist, masterCover || null, release]
                );
                masterCache.set(discogsMasterId, discogsMasterId);
                console.log(`Created master ${discogsMasterId} for ${artist} - ${recordName}`);
                
                // Fetch and insert genres/styles for the newly created master
                const genreData = await fetchDiscogsMasterDetails(discogsMasterId);
                if (genreData && (genreData.genres.length > 0 || genreData.styles.length > 0)) {
                  await insertMasterGenres(pool, discogsMasterId, genreData.genres, genreData.styles);
                  console.log(`Added ${genreData.genres.length} genres and ${genreData.styles.length} styles for master ${discogsMasterId}`);
                }
              }
            }
            
            masterId = masterCache.get(discogsMasterId);
            isCustom = false;
            usedMasterIds.add(discogsMasterId);
          }
        }
      }

      // Fetch cover for the record
      const cover = await fetchLastFmCover(artist, recordName);
      if (!cover) {
        withoutCover += 1;
      }

  const addedAtUtcRaw = dateAdded
    ? formatUtcDateTime(`${dateAdded}T00:00:00Z`)
    : formatUtcDateTime(new Date());
  const addedAtUtc = addedAtUtcRaw ?? formatUtcDateTime(new Date());
      const [insertResult] = await pool.execute(
        `INSERT INTO Record (name, artist, cover, rating, release_year, tableId, userUuid, added, masterId, isCustom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [recordName, artist, cover || null, rating, release, tableId, req.userUuid, addedAtUtc, masterId, isCustom]
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
    console.log('Discogs import completed. Created:', created, 'Skipped:', skipped, 'Without cover:', withoutCover);
  } catch (err) {
    console.error('Discogs import failed', err);
    res.status(500).json({ error: 'Failed to import Discogs collection' });
  }
});

/**
 * POST /api/records/clear
 * Deletes all records from a user's collection
 * @returns {Object} Success status
 */
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

/**
 * GET /api/lastfm/album.search
 * Search Last.fm for album artwork and metadata
 * @query {string} q - Search query (artist and/or album name)
 * @query {string} [page] - Page number for pagination (default: 1)
 * @returns {Object} Last.fm search results
 */
/**
 * GET /api/lastfm/album.search
 * Proxy to Last.fm album search (requires LASTFM_API_KEY in environment)
 * @query {string} q - Search query
 * @query {number} [page] - Page number for pagination
 * @returns {Object} Last.fm album search results
 */
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

/**
 * GET /api/preferences/record-table
 * Retrieves record table view preferences (column visibility, default sort)
 * @returns {Object} Record table preferences
 */
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

/**
 * POST /api/preferences/record-table
 * Updates record table view preferences
 * @body {Object} columnVisibility - Visibility settings for each column
 * @body {Object} defaultSort - Default sort field and order
 * @returns {Object} Updated preferences
 */
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

/**
 * GET /api/profile/highlights
 * Retrieves the authenticated user's profile highlight record IDs
 * @returns {Array} Record IDs marked as highlights
 */
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

/**
 * POST /api/profile/highlights
 * Updates the authenticated user's profile highlights
 * @body {Array} highlightIds - Array of record IDs to highlight (max 3)
 * @returns {Object} Updated highlights
 */
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

/**
 * GET /api/collections/privacy
 * Retrieves privacy settings for all user collections
 * @returns {Array} Collection privacy information
 */
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

/**
 * POST /api/collections/privacy
 * Updates privacy settings for a collection
 * @body {string} tableName - Collection name to update
 * @body {boolean} isPrivate - Privacy setting (true = private, false = public)
 * @returns {Object} Updated collection privacy settings
 */
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

/**
 * POST /api/lists
 * Creates a new list for the authenticated user with optional cover picture
 * @body {string} name - List name (required)
 * @body {string} [description] - List description
 * @body {boolean} [isPrivate] - Privacy setting (default: false)
 * @body {File} [picture] - Optional cover image file
 * @returns {Object} Created list object
 */
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

/**
 * PATCH /api/lists/:listId
 * Updates an existing list metadata
 * @param {number} listId - List ID
 * @body {string} [name] - Updated list name
 * @body {string} [description] - Updated description
 * @body {boolean} [isPrivate] - Updated privacy setting
 * @returns {Object} Updated list object
 */
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

/**
 * DELETE /api/lists/:listId
 * Deletes a list owned by the authenticated user
 * @param {number} listId - List ID to delete
 * @returns {Object} Success status
 */
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

/**
 * POST /api/lists/:listId/picture
 * Uploads or updates a list cover picture
 * @param {number} listId - List ID
 * @body {File} picture - Cover image file
 * @returns {Object} Updated picture URL
 */
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

/**
 * DELETE /api/lists/:listId/picture
 * Removes the list cover picture
 * @param {number} listId - List ID
 * @returns {Object} Success status
 */
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

/**
 * GET /api/lists/search
 * Searches public lists by name or description
 * @query {string} q - Search query
 * @query {number} [limit] - Results per page
 * @query {number} [offset] - Pagination offset
 * @returns {Array} Matching public lists
 */
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

/**
 * GET /api/lists/popular
 * Retrieves most popular public lists by like count
 * @query {number} [limit] - Number of lists to return
 * @query {number} [offset] - Pagination offset
 * @returns {Array} Popular lists
 */
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

/**
 * GET /api/lists/:listId
 * Retrieves a list with all its records (public or owned by authenticated user)
 * @param {number} listId - List ID
 * @returns {Object} List with records array
 */
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

/**
 * POST /api/lists/:listId/records
 * Adds a record to a list or reorders list records
 * @param {number} listId - List ID
 * @body {number|Object} recordId - Record ID or record data to add
 * @body {Array} [sortOrder] - New sort order for all records
 * @returns {Object} Updated record in list
 */
app.post('/api/lists/:listId/records', requireAuth, async (req, res) => {
  const listId = Number(req.params.listId);
  console.log('Adding record to list...', listId);
  if (!Number.isInteger(listId) || listId <= 0) {
    return res.status(400).json({ error: 'Invalid list id' });
  }
  const masterId = parseMasterId(req.body?.masterId);
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
  
  // Extract genres and styles from request body
  const genres = Array.isArray(req.body?.genres) ? req.body.genres : [];
  const styles = Array.isArray(req.body?.styles) ? req.body.styles : [];
  
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
                ? cleanDiscogsArtist(discogsData.artists[0].name)
                : '';
            const discogsCover = 
              typeof discogsData.images?.[0]?.uri === 'string' 
                ? discogsData.images[0].uri 
                : null;
            const discogsYear = Number(discogsData.year);
            const discogsReleaseYear = Number.isInteger(discogsYear) ? discogsYear : null;
            
            // Extract genres and styles from Discogs data
            const discogsGenres = Array.isArray(discogsData.genres) ? discogsData.genres : [];
            const discogsStyles = Array.isArray(discogsData.styles) ? discogsData.styles : [];

            // Insert the master into the database
            await pool.execute(
              `INSERT INTO Master (id, name, artist, cover, release_year) VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE name = VALUES(name), artist = VALUES(artist), cover = VALUES(cover), release_year = VALUES(release_year)`,
              [masterId, discogsName, discogsArtist, discogsCover, discogsReleaseYear]
            );
            
            // Insert genres and styles
            await insertMasterGenres(pool, masterId, discogsGenres, discogsStyles);

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
        
        // Insert genres/styles if provided and master exists
        if ((genres.length > 0 || styles.length > 0)) {
          await insertMasterGenres(pool, masterId, genres, styles);
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

/**
 * DELETE /api/lists/:listId/records/:recordId
 * Removes a record from a list
 * @param {number} listId - List ID
 * @param {number} recordId - Record ID to remove
 * @returns {Object} Success status
 */
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

// This route must come BEFORE app.put('/api/lists/:listId/records/:recordId')
/**
 * PUT /api/lists/:listId/records/reorder
 * Reorders records in a list (must be called before PUT /api/lists/:listId/records/:recordId)
 * @param {number} listId - List ID
 * @body {Array} Array of objects with id and sortOrder fields
 * @returns {Object} {success: true} or error message
 */
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

/**
 * PUT /api/lists/:listId/records/:recordId
 * Updates a record within a list (e.g., custom notes, rating)
 * @param {number} listId - List ID
 * @param {number} recordId - Record ID
 * @body {Object} - Updated record fields
 * @returns {Object} Updated record
 */
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

/**
 * POST /api/lists/:listId/like
 * Adds a like to a list from the authenticated user
 * @param {number} listId - List ID to like
 * @returns {Object} Updated like count
 */
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

/**
 * DELETE /api/lists/:listId/like
 * Removes a like from a list by the authenticated user
 * @param {number} listId - List ID to unlike
 * @returns {Object} Updated like count
 */
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

/**
 * GET /api/admin/users
 * Retrieves paginated list of all users (admin only)
 * @query {number} [limit] - Results per page
 * @query {number} [offset] - Pagination offset
 * @query {string} [q] - Search query for filtering users
 * @returns {Array} User objects with statistics
 */
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const rawSearch = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 25;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.trunc(offsetRaw) : 0;
  const searchTerm = rawSearch.slice(0, 64);
  const params = [];
  console.log('Admin listing users...', { searchTerm, limit, offset });
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
              u.email,
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
      email: row.email ?? null,
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

/**
 * PATCH /api/admin/users/:userUuid
 * Updates user information or permissions (admin only)
 * @param {string} userUuid - User UUID
 * @body {string} [username] - Updated username
 * @body {string} [displayName] - Updated display name
 * @body {boolean} [isAdmin] - Admin status
 * @body {boolean} [canManageAdmins] - Permission to manage other admins
 * @body {boolean} [canDeleteUsers] - Permission to delete users
 * @returns {Object} Updated user
 */
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

/**
 * DELETE /api/admin/users/:userUuid
 * Permanently deletes a user account and all associated data (admin only)
 * @param {string} userUuid - User UUID to delete
 * @returns {Object} Success status
 */
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

/**
 * GET /api/admin/records
 * Retrieves paginated list of all records in system (admin only)
 * @query {number} [limit] - Results per page
 * @query {number} [offset] - Pagination offset
 * @returns {Array} Record objects with user info
 */
app.get('/api/admin/records', requireAuth, requireAdmin, async (req, res) => {
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
  console.log('Admin listing records...', { searchTerm, rawOwner, rawMasterId, limit, offset });

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
    const masterId = parseMasterId(rawMasterId);
    if (isValidMasterId(masterId)) {
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
      masterId: row.masterId ?? null,
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

/**
 * PATCH /api/admin/records/:recordId
 * Updates record metadata (admin only)
 * @param {number} recordId - Record ID
 * @body {string} [name] - Record name
 * @body {string} [artist] - Artist name
 * @body {string} [cover] - Cover image URL
 * @body {number} [rating] - Rating (0-10)
 * @body {number} [release_year] - Release year
 * @body {string} [masterId] - Discogs master ID
 * @returns {Object} Updated record
 */
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
      const masterValue = parseMasterId(masterId);
      if (!masterValue) {
        return res.status(400).json({ error: 'masterId must be a valid master ID (positive integer or r-prefixed release ID) or null' });
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
        masterId: row.masterId ?? null,
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

/**
 * DELETE /api/admin/records/:recordId
 * Deletes a record from the system (admin only)
 * @param {number} recordId - Record ID to delete
 * @returns {Object} Success status
 */
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

/**
 * GET /api/admin/masters
 * Retrieves paginated list of all master records (admin only)
 * @query {number} [limit] - Results per page
 * @query {number} [offset] - Pagination offset
 * @returns {Array} Master record objects
 */
app.get('/api/admin/masters', requireAuth, requireAdmin, async (req, res) => {
  const rawSearch = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 25;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.trunc(offsetRaw) : 0;
  const searchTerm = rawSearch.slice(0, 64);
  const params = [];
  console.log('Admin listing masters...', { searchTerm, limit, offset });
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
              m.ratingAve,
              (SELECT COUNT(*) FROM MasterGenre mg WHERE mg.masterId = m.id) AS genreCount
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
      genreCount: Number(row.genreCount) || 0,
    }));
    res.json({ masters, total, limit, offset });
  } catch (error) {
    console.error('Failed to list masters for admin', error);
    res.status(500).json({ error: 'Failed to list masters' });
  }
});

/**
 * PATCH /api/admin/masters/:masterId
 * Updates master record metadata (admin only)
 * @param {string} masterId - Master ID
 * @body {string} [artist] - Master artist name
 * @body {string} [name] - Master record name
 * @body {string} [cover] - Cover image URL
 * @returns {Object} Updated master record
 */
app.patch('/api/admin/masters/:masterId', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin updating master...');
  const masterId = parseMasterId(req.params.masterId);
  if (!isValidMasterId(masterId)) {
    return res.status(400).json({ error: 'masterId must be a valid master ID' });
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

  if (updates.length === 0 && req.body.genres === undefined && req.body.styles === undefined) {
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

    // Update master fields if any
    if (updates.length > 0) {
      params.push(masterId);
      await pool.execute(`UPDATE Master SET ${updates.join(', ')} WHERE id = ?`, params);
      
      // If name or artist changed, also update user records with this masterId
      if (name !== undefined || artist !== undefined) {
        const recordUpdates = [];
        const recordParams = [];
        if (name !== undefined) {
          recordUpdates.push('name = ?');
          recordParams.push(name.trim().slice(0, 255));
        }
        if (artist !== undefined) {
          recordUpdates.push('artist = ?');
          recordParams.push(artist === null ? null : artist.trim().slice(0, 255));
        }
        if (recordUpdates.length > 0) {
          // Update Record table
          await pool.execute(
            `UPDATE Record SET ${recordUpdates.join(', ')} WHERE masterId = ?`,
            [...recordParams, masterId]
          );
          // Update ListRecord table
          await pool.execute(
            `UPDATE ListRecord SET ${recordUpdates.join(', ')} WHERE masterId = ?`,
            [...recordParams, masterId]
          );
        }
      }
    }

    // Update genres and styles if provided
    if (req.body.genres !== undefined || req.body.styles !== undefined) {
      const genres = Array.isArray(req.body.genres) ? req.body.genres : [];
      const styles = Array.isArray(req.body.styles) ? req.body.styles : [];
      
      // Delete existing genres/styles for this master
      await pool.execute('DELETE FROM MasterGenre WHERE masterId = ?', [masterId]);
      
      // Insert new genres/styles
      await insertMasterGenres(pool, masterId, genres, styles);
    }

    const [rows] = await pool.query(
      `SELECT m.id,
              m.name,
              m.artist,
              m.cover,
              m.release_year,
              m.ratingAve,
              (SELECT COUNT(*) FROM MasterGenre mg WHERE mg.masterId = m.id) AS genreCount
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
        genreCount: Number(row.genreCount) || 0,
      },
    });
  } catch (error) {
    console.error('Failed to update master as admin', error);
    res.status(500).json({ error: 'Failed to update master' });
  }
});

/**
 * GET /api/admin/masters/:masterId/genres
 * Retrieves genres and styles associated with a master record (admin only)
 * @param {string} masterId - Master ID
 * @returns {Array} Array of genres and styles with isStyle flag
 */
app.get('/api/admin/masters/:masterId/genres', requireAuth, requireAdmin, async (req, res) => {
  const masterId = parseMasterId(req.params.masterId);
  if (!isValidMasterId(masterId)) {
    return res.status(400).json({ error: 'Invalid masterId' });
  }

  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT genre, isStyle FROM MasterGenre WHERE masterId = ? ORDER BY isStyle, genre`,
      [masterId]
    );
    
    const genres = [];
    const styles = [];
    
    for (const row of rows) {
      if (row.isStyle) {
        styles.push(row.genre);
      } else {
        genres.push(row.genre);
      }
    }
    
    res.json({ genres, styles });
  } catch (error) {
    console.error('Failed to fetch master genres', error);
    res.status(500).json({ error: 'Failed to fetch genres' });
  }
});

/**
 * DELETE /api/admin/masters/:masterId
 * Deletes a master record from the system (admin only)
 * @param {string} masterId - Master ID to delete
 * @returns {Object} Success status
 */
app.delete('/api/admin/masters/:masterId', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin deleting master...');
  const masterId = parseMasterId(req.params.masterId);
  if (!isValidMasterId(masterId)) {
    return res.status(400).json({ error: 'masterId must be a valid master ID' });
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

/**
 * GET /api/admin/tags
 * Retrieves paginated list of all tags in system (admin only)
 * @query {number} [limit] - Results per page
 * @query {number} [offset] - Pagination offset
 * @returns {Array} Tag objects with usage counts
 */
app.get('/api/admin/tags', requireAuth, requireAdmin, async (req, res) => {
  const rawSearch = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rawOwner = typeof req.query.user === 'string' ? req.query.user.trim() : '';
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 25;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.trunc(offsetRaw) : 0;
  const searchTerm = rawSearch.slice(0, 64);
  const conditions = [];
  const params = [];
  console.log('Admin listing tags...', { searchTerm, rawOwner, limit, offset });

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

/**
 * PATCH /api/admin/tags/:tagId
 * Updates a tag (admin only)
 * @param {number} tagId - Tag ID
 * @body {string} [name] - New tag name
 * @returns {Object} Updated tag
 */
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

/**
 * DELETE /api/admin/tags/:tagId
 * Deletes a tag from the system (admin only)
 * @param {number} tagId - Tag ID to delete
 * @returns {Object} Success status
 */
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
  const rawSearch = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rawOwner = typeof req.query.user === 'string' ? req.query.user.trim() : '';
  const limitRaw = Number(req.query.limit);
  const offsetRaw = Number(req.query.offset);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 25;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.trunc(offsetRaw) : 0;
  const searchTerm = rawSearch.slice(0, 128);
  const conditions = [];
  const params = [];
  console.log('Admin listing lists...', { searchTerm, rawOwner, limit, offset });

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

// ===================== REPORTS =====================

/**
 * POST /api/reports
 * Submits a report for content violations, user issues, or system problems
 * @body {string} type - Report type: 'general', 'user', 'record', 'master', or 'list'
 * @body {string} reason - Reason for the report
 * @body {string} [notes] - Additional notes about the report
 * @body {string|number} [targetId] - ID of the target record/master/list
 * @body {string} [targetUsername] - Username of the target user
 * @returns {Object} {success: true} or error message
 */
app.post('/api/reports', requireAuth, async (req, res) => {
  console.log('Submitting report...');
  const userUuid = req.userUuid;
  const { type, reason, notes, targetId, targetUsername } = req.body;

  if (!['general', 'user', 'record', 'master', 'list'].includes(type)) {
    return res.status(400).json({ error: 'Invalid report type' });
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'reason is required' });
  }

  const trimmedReason = reason.trim();
  const trimmedNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;

  try {
    const pool = await getPool();

    let targetUserUuid = null;
    let targetRecordId = null;
    let targetMasterId = null;
    let targetListId = null;

    if (type === 'user') {
      if (!targetUsername || typeof targetUsername !== 'string') {
        return res.status(400).json({ error: 'targetUsername is required for user reports' });
      }
      // Get the user's uuid from username
      const [userRows] = await pool.query(
        'SELECT uuid FROM User WHERE username = ?',
        [targetUsername.trim()]
      );
      if (!Array.isArray(userRows) || userRows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      targetUserUuid = userRows[0].uuid;
    } else if (type === 'record') {
      targetRecordId = Number(targetId);
      if (!Number.isInteger(targetRecordId) || targetRecordId <= 0) {
        return res.status(400).json({ error: 'targetId (recordId) is required for record reports' });
      }
    } else if (type === 'master') {
      targetMasterId = Number(targetId);
      if (!Number.isInteger(targetMasterId) || targetMasterId <= 0) {
        return res.status(400).json({ error: 'targetId (masterId) is required for master reports' });
      }
    } else if (type === 'list') {
      targetListId = Number(targetId);
      if (!Number.isInteger(targetListId) || targetListId <= 0) {
        return res.status(400).json({ error: 'targetId (listId) is required for list reports' });
      }
    }

    await pool.execute(
      `INSERT INTO Report (type, reportedBy, targetUserUuid, targetRecordId, targetMasterId, targetListId, reason, userNotes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, userUuid, targetUserUuid, targetRecordId, targetMasterId, targetListId, trimmedReason, trimmedNotes]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to submit report', error);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

/**
 * GET /api/admin/reports
 * Retrieves paginated list of all reports with optional filters (admin only)
 * @query {number} [page] - Page number for pagination (default: 1)
 * @query {string} [type] - Filter by report type: 'general', 'user', 'record', 'master', 'list'
 * @query {string} [status] - Filter by status: 'open', 'resolved', 'dismissed'
 * @query {string} [reportedBy] - Filter by username of report submitter
 * @returns {Object} Paginated reports with total count
 */
app.get('/api/admin/reports', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin fetching reports...');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 10;
  const offset = (page - 1) * limit;
  
  const typeFilter = typeof req.query.type === 'string' && req.query.type.trim() ? req.query.type.trim().toLowerCase() : null;
  const statusFilter = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : null;
  const reportedByFilter = typeof req.query.reportedBy === 'string' && req.query.reportedBy.trim() ? req.query.reportedBy.trim() : null;

  try {
    const pool = await getPool();
    
    // Build WHERE conditions
    const whereConditions = [];
    const whereParams = [];

    if (typeFilter) {
      whereConditions.push('r.type = ?');
      whereParams.push(typeFilter);
    }
    if (statusFilter) {
      whereConditions.push('r.status = ?');
      whereParams.push(statusFilter);
    }
    if (reportedByFilter) {
      whereConditions.push('u.username LIKE ?');
      whereParams.push(`%${escapeForLike(reportedByFilter)}%`);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // Get total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS cnt 
       FROM Report r
       LEFT JOIN User u ON r.reportedBy = u.uuid
       ${whereClause}`,
      whereParams
    );
    const totalCount = Number(countRows[0]?.cnt || 0);

    // Get paginated reports with JOINs to get target names
    const [rows] = await pool.query(
      `SELECT 
         r.id,
         r.type,
         r.reason,
         r.userNotes,
         r.created,
         r.status,
         r.adminNotes,
         r.targetUserUuid,
         r.targetRecordId,
         r.targetMasterId,
         r.targetListId,
         u.username AS reportedByUsername,
         tu.username AS targetUsername,
         tu.displayName AS targetUserDisplayName,
         rec.name AS targetRecordName,
         recOwner.username AS targetRecordOwnerUsername,
         m.name AS targetMasterName,
         l.name AS targetListName,
         listOwner.username AS targetListOwnerUsername
       FROM Report r
       LEFT JOIN User u ON r.reportedBy = u.uuid
       LEFT JOIN User tu ON r.targetUserUuid = tu.uuid
       LEFT JOIN Record rec ON r.targetRecordId = rec.id
       LEFT JOIN User recOwner ON rec.userUuid = recOwner.uuid
       LEFT JOIN Master m ON r.targetMasterId = m.id
       LEFT JOIN List l ON r.targetListId = l.id
       LEFT JOIN User listOwner ON l.userUuid = listOwner.uuid
       ${whereClause}
       ORDER BY r.created DESC
       LIMIT ? OFFSET ?`,
      [...whereParams, limit, offset]
    );

    const reports = (rows || []).map(row => {
      let targetId = null;
      let targetName = null;
      let targetUsername = null;

      if (row.type === 'user') {
        targetName = row.targetUserDisplayName || row.targetUsername;
        targetUsername = row.targetUsername;
      } else if (row.type === 'record') {
        targetId = row.targetRecordId;
        targetName = row.targetRecordName;
        targetUsername = row.targetRecordOwnerUsername;
      } else if (row.type === 'master') {
        targetId = row.targetMasterId;
        targetName = row.targetMasterName;
      } else if (row.type === 'list') {
        targetId = row.targetListId;
        targetName = row.targetListName;
        targetUsername = row.targetListOwnerUsername;
      }

      return {
        id: Number(row.id),
        type: String(row.type),
        reportedByUsername: row.reportedByUsername ? String(row.reportedByUsername) : null,
        reason: String(row.reason),
        userNotes: row.userNotes ? String(row.userNotes) : null,
        created: row.created ? String(row.created) : null,
        status: String(row.status),
        adminNotes: row.adminNotes ? String(row.adminNotes) : null,
        targetId: targetId ? Number(targetId) : null,
        targetName: targetName ? String(targetName) : null,
        targetUsername: targetUsername ? String(targetUsername) : null,
      };
    });

    res.json({
      reports,
      total: totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error('Failed to fetch reports as admin', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Update report status (admin only)
app.patch('/api/admin/reports/:type/:id', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin updating report...');
  const { id } = req.params;
  const reportId = Number(id);

  if (!Number.isInteger(reportId) || reportId <= 0) {
    return res.status(400).json({ error: 'Invalid report ID' });
  }

  const { status, adminNotes } = req.body;
  if (typeof status !== 'string' || !status.trim()) {
    return res.status(400).json({ error: 'status is required' });
  }

  const trimmedStatus = status.trim();
  const trimmedAdminNotes = typeof adminNotes === 'string' && adminNotes.trim() ? adminNotes.trim() : null;

  try {
    const pool = await getPool();
    const [result] = await pool.execute(
      `UPDATE Report SET status = ?, adminNotes = ? WHERE id = ?`,
      [trimmedStatus, trimmedAdminNotes, reportId]
    );

    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check if there are still pending reports
    let hasPendingReports = false;
    try {
      const [pendingCheck] = await pool.execute(
        `SELECT EXISTS(SELECT 1 FROM Report WHERE status = 'Pending') AS hasPending`
      );
      hasPendingReports = Boolean(pendingCheck[0]?.hasPending);
    } catch (pendingErr) {
      console.warn('Could not check pending reports:', pendingErr.message);
    }

    res.json({ success: true, hasPendingReports });
  } catch (error) {
    console.error('Failed to update report as admin', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// Admin endpoint to bulk replace cover URLs
app.post('/api/admin/covers/replace', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin replacing cover URLs...');
  const { oldCoverUrl, newCoverUrl } = req.body;

  if (typeof oldCoverUrl !== 'string' || !oldCoverUrl.trim()) {
    return res.status(400).json({ error: 'oldCoverUrl is required' });
  }
  if (typeof newCoverUrl !== 'string' || !newCoverUrl.trim()) {
    return res.status(400).json({ error: 'newCoverUrl is required' });
  }

  const trimmedOld = oldCoverUrl.trim();
  const trimmedNew = newCoverUrl.trim();

  if (trimmedOld === trimmedNew) {
    return res.status(400).json({ error: 'Old and new cover URLs cannot be the same' });
  }

  try {
    const pool = await getPool();
    
    // Update Master table
    const [masterResult] = await pool.execute(
      'UPDATE Master SET cover = ? WHERE cover = ?',
      [trimmedNew, trimmedOld]
    );

    // Update Record table
    const [recordResult] = await pool.execute(
      'UPDATE Record SET cover = ? WHERE cover = ?',
      [trimmedNew, trimmedOld]
    );

    // Update ListRecord table
    const [listRecordResult] = await pool.execute(
      'UPDATE ListRecord SET cover = ? WHERE cover = ?',
      [trimmedNew, trimmedOld]
    );

    const masterCount = masterResult.affectedRows || 0;
    const recordCount = recordResult.affectedRows || 0;
    const listRecordCount = listRecordResult.affectedRows || 0;
    const totalCount = masterCount + recordCount + listRecordCount;

    console.log(`Cover URLs replaced: ${masterCount} masters, ${recordCount} records, ${listRecordCount} list records (total: ${totalCount})`);

    res.json({
      success: true,
      masterCount,
      recordCount,
      listRecordCount,
      totalCount
    });
  } catch (error) {
    console.error('Failed to replace cover URLs as admin', error);
    res.status(500).json({ error: 'Failed to replace cover URLs' });
  }
});

// Admin endpoint to merge two masters

/**
 * POST /api/admin/masters/merge
 * Merges two master records into one (admin only)
 * Updates all records and list records associated with the old master to the new master
 * @body {string} oldMasterId - Master ID to merge from
 * @body {string} newMasterId - Master ID to merge into
 * @returns {Object} Merge statistics (duplicatesMarked, recordsUpdated, listRecordsUpdated, userGenresUpdated)
 */
app.post('/api/admin/masters/merge', requireAuth, requireAdmin, async (req, res) => {
  console.log('Admin merging masters...');
  const { oldMasterId, newMasterId } = req.body;

  const parsedOldMasterId = parseMasterId(oldMasterId);
  const parsedNewMasterId = parseMasterId(newMasterId);

  if (!isValidMasterId(parsedOldMasterId)) {
    return res.status(400).json({ error: 'Valid oldMasterId is required' });
  }
  if (!isValidMasterId(parsedNewMasterId)) {
    return res.status(400).json({ error: 'Valid newMasterId is required' });
  }
  if (parsedOldMasterId === parsedNewMasterId) {
    return res.status(400).json({ error: 'Old and new Master IDs cannot be the same' });
  }

  try {
    const pool = await getPool();

    // Verify both masters exist and get their details
    const [oldMasterRows] = await pool.query(
      'SELECT id, name, artist, cover FROM Master WHERE id = ? LIMIT 1',
      [parsedOldMasterId]
    );
    if (!oldMasterRows || oldMasterRows.length === 0) {
      return res.status(404).json({ error: `Old master ID ${parsedOldMasterId} not found` });
    }
    const oldMaster = oldMasterRows[0];

    const [newMasterRows] = await pool.query(
      'SELECT id, name, artist, cover FROM Master WHERE id = ? LIMIT 1',
      [parsedNewMasterId]
    );
    if (!newMasterRows || newMasterRows.length === 0) {
      return res.status(404).json({ error: `New master ID ${parsedNewMasterId} not found` });
    }
    const newMaster = newMasterRows[0];

    // Step 1: Find users who have records for BOTH masters
    // For these users, mark the old master record as custom and remove its masterId
    const [duplicateUsers] = await pool.query(
      `SELECT DISTINCT r1.id AS oldRecordId
       FROM Record r1
       WHERE r1.masterId = ?
         AND (r1.isCustom IS NULL OR r1.isCustom = FALSE)
         AND EXISTS (
           SELECT 1 FROM Record r2
           WHERE r2.masterId = ?
             AND r2.userUuid = r1.userUuid
             AND (r2.isCustom IS NULL OR r2.isCustom = FALSE)
         )`,
      [parsedOldMasterId, parsedNewMasterId]
    );

    let duplicatesMarkedCustom = 0;
    if (duplicateUsers && duplicateUsers.length > 0) {
      const duplicateRecordIds = duplicateUsers.map(row => row.oldRecordId);
      // Mark these records as custom and remove masterId
      const [duplicateResult] = await pool.execute(
        `UPDATE Record SET isCustom = TRUE, masterId = NULL WHERE id IN (${duplicateRecordIds.map(() => '?').join(',')})`,
        duplicateRecordIds
      );
      duplicatesMarkedCustom = duplicateResult.affectedRows || 0;
    }

    // Step 2: Update remaining Record entries from old master to new master
    // Also update name, artist, and cover if they match the old master's values
    const [recordResult] = await pool.execute(
      `UPDATE Record SET 
        masterId = ?,
        name = CASE WHEN name = ? THEN ? ELSE name END,
        artist = CASE WHEN artist = ? THEN ? ELSE artist END,
        cover = CASE WHEN cover = ? THEN ? ELSE cover END
       WHERE masterId = ?`,
      [parsedNewMasterId, oldMaster.name, newMaster.name, oldMaster.artist, newMaster.artist, oldMaster.cover, newMaster.cover, parsedOldMasterId]
    );
    const recordsUpdated = recordResult.affectedRows || 0;

    // Step 3: Update ListRecord entries from old master to new master
    // Also update name, artist, and cover if they match the old master's values
    const [listRecordResult] = await pool.execute(
      `UPDATE ListRecord SET 
        masterId = ?,
        name = CASE WHEN name = ? THEN ? ELSE name END,
        artist = CASE WHEN artist = ? THEN ? ELSE artist END,
        cover = CASE WHEN cover = ? THEN ? ELSE cover END
       WHERE masterId = ?`,
      [parsedNewMasterId, oldMaster.name, newMaster.name, oldMaster.artist, newMaster.artist, oldMaster.cover, newMaster.cover, parsedOldMasterId]
    );
    const listRecordsUpdated = listRecordResult.affectedRows || 0;

    // Step 4: Update ListeningTo entries from old master to new master
    // First, delete ListeningTo entries for old master where user already has new master
    await pool.execute(
      `DELETE FROM ListeningTo 
       WHERE masterId = ? 
         AND userUuid IN (SELECT userUuid FROM (SELECT userUuid FROM ListeningTo WHERE masterId = ?) AS tmp)`,
      [parsedOldMasterId, parsedNewMasterId]
    );
    // Then update remaining ListeningTo entries
    const [listeningToResult] = await pool.execute(
      'UPDATE ListeningTo SET masterId = ? WHERE masterId = ?',
      [parsedNewMasterId, parsedOldMasterId]
    );
    const listeningToUpdated = listeningToResult.affectedRows || 0;

    // Step 5: Update Report entries from old master to new master
    const [reportResult] = await pool.execute(
      'UPDATE Report SET targetMasterId = ? WHERE targetMasterId = ?',
      [parsedNewMasterId, parsedOldMasterId]
    );
    const reportsUpdated = reportResult.affectedRows || 0;

    // Step 6: Delete the old master (MasterGenre will cascade delete)
    await pool.execute('DELETE FROM Master WHERE id = ?', [parsedOldMasterId]);

    // Step 7: Recalculate ratings for the new master
    await pool.execute('CALL update_master_ratings(?)', [parsedNewMasterId]);

    console.log(`Masters merged: old=${parsedOldMasterId} -> new=${parsedNewMasterId}. ` +
      `Duplicates marked custom: ${duplicatesMarkedCustom}, Records: ${recordsUpdated}, ` +
      `ListRecords: ${listRecordsUpdated}, ListeningTo: ${listeningToUpdated}, Reports: ${reportsUpdated}`);

    res.json({
      success: true,
      duplicatesMarkedCustom,
      recordsUpdated,
      listRecordsUpdated,
      listeningToUpdated,
      reportsUpdated
    });
  } catch (error) {
    console.error('Failed to merge masters as admin', error);
    res.status(500).json({ error: 'Failed to merge masters' });
  }
});

// Search for master records (for listening to feature)
app.get("/api/masters/search", requireAuth, async (req, res) => {
  console.log("Searching for master records...");
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  
  if (query.length < 2) {
    return res.json([]);
  }

  try {
    const pool = await getPool();
    const likeTerm = `%${escapeForLike(query)}%`;
    
    const [rows] = await pool.query(
      `SELECT id, name, artist, cover
       FROM Master
       WHERE name LIKE ? OR artist LIKE ?
       ORDER BY name
       LIMIT 5`,
      [likeTerm, likeTerm]
    );

    const results = rows.map((row) => ({
      masterId: row.id,
      name: typeof row.name === 'string' ? row.name : '',
      artist: typeof row.artist === 'string' && row.artist.trim() ? row.artist.trim() : null,
      cover: typeof row.cover === 'string' && row.cover.trim() ? row.cover.trim() : null,
    }));

    res.json(results);
  } catch (error) {
    console.error("Master search failed", error);
    res.status(500).json({ error: "Failed to search masters" });
  }
});

/**
 * GET /api/user/listening-to
 * Retrieves the current record the user is listening to (if any)
 * @returns {Object} Current listening record details (artist, cover, name, masterId)
 */
app.get("/api/user/listening-to", requireAuth, async (req, res) => {
  console.log("Fetching listening to...");
  
  try {
    const pool = await getPool();
    // Use LEFT JOIN so we can get the masterId even if it's not in Master table
    const [rows] = await pool.query(
      `SELECT m.artist, m.cover, m.name, lt.masterId 
       FROM ListeningTo lt
       LEFT JOIN Master m ON m.id = lt.masterId
       WHERE lt.userUuid = ? LIMIT 1`,
      [req.userUuid]
    );

    if (!rows || rows.length === 0) {
      return res.json({ listeningTo: null });
    }

    const row = rows[0];
    let artist = typeof row.artist === 'string' && row.artist.trim() ? row.artist.trim() : null;
    let cover = typeof row.cover === 'string' && row.cover.trim() ? row.cover.trim() : null;
    let name = typeof row.name === 'string' ? row.name : '';
    const masterId = row.masterId ?? null;

    // If masterId exists but no data from Master table, fetch from Discogs
    if (masterId && !row.name) {
      const isRelease = masterId.startsWith("r");
      const numericId = isRelease ? masterId.slice(1) : masterId;
      const discogsEndpoint = isRelease ? "releases" : "masters";
      
      try {
        const discogsUrl = `https://api.discogs.com/${discogsEndpoint}/${numericId}`;
        const discogsResponse = await fetch(discogsUrl, {
          headers: {
            "User-Agent": DISCOGS_USER_AGENT,
            Accept: "application/json",
          },
        });
        
        if (discogsResponse.ok) {
          const discogsData = await discogsResponse.json();
          artist = typeof discogsData?.artists?.[0]?.name === "string" ? cleanDiscogsArtist(discogsData.artists[0].name) : null;
          cover = typeof discogsData?.images?.[0]?.uri === "string" && discogsData.images[0].uri.trim()
            ? discogsData.images[0].uri.trim()
            : null;
          name = typeof discogsData?.title === "string" ? discogsData.title : '';
        }
      } catch (discogsError) {
        console.warn("Failed to fetch listening to details from Discogs", discogsError);
      }
    }

    const listeningTo = { artist, cover, name, masterId };

    res.json({ listeningTo });
  } catch (error) {
    console.error("Failed to fetch listening to", error);
    res.status(500).json({ error: "Failed to fetch listening to" });
  }
});

/**
 * PUT /api/user/listening-to
 * Updates the current record the authenticated user is listening to
 * @body {string} masterId - Master ID of the record to set as currently listening
 * @returns {Object} Updated listening record (success, listeningTo)
 */
app.put("/api/user/listening-to", requireAuth, async (req, res) => {
  console.log("Updating listening to...");
  
  const masterId = parseMasterId(req.body?.masterId);
  
  if (!isValidMasterId(masterId)) {
    return res.status(400).json({ error: "Valid masterId is required" });
  }

  try {
    const pool = await getPool();
    
    // Try to get master info from database first
    const [masterRows] = await pool.query(
      `SELECT id, name, artist, cover FROM Master WHERE id = ? LIMIT 1`,
      [masterId]
    );

    let artist = null;
    let cover = null;
    let name = '';

    if (masterRows && masterRows.length > 0) {
      // Master exists in database
      const master = masterRows[0];
      artist = typeof master.artist === 'string' && master.artist.trim() ? master.artist.trim() : null;
      cover = typeof master.cover === 'string' && master.cover.trim() ? master.cover.trim() : null;
      name = typeof master.name === 'string' ? master.name : '';
    } else {
      // Master not in database - fetch from Discogs for 'r'-prefixed IDs (releases)
      const isRelease = masterId.startsWith("r");
      const numericId = isRelease ? masterId.slice(1) : masterId;
      const discogsEndpoint = isRelease ? "releases" : "masters";
      
      try {
        const discogsUrl = `https://api.discogs.com/${discogsEndpoint}/${numericId}`;
        const discogsResponse = await fetch(discogsUrl, {
          headers: {
            "User-Agent": DISCOGS_USER_AGENT,
            Accept: "application/json",
          },
        });
        
        if (discogsResponse.ok) {
          const discogsData = await discogsResponse.json();
          artist = typeof discogsData?.artists?.[0]?.name === "string" ? cleanDiscogsArtist(discogsData.artists[0].name) : null;
          cover = typeof discogsData?.images?.[0]?.uri === "string" && discogsData.images[0].uri.trim()
            ? discogsData.images[0].uri.trim()
            : null;
          name = typeof discogsData?.title === "string" ? discogsData.title : '';
        } else {
          return res.status(404).json({ error: "Record not found on Discogs" });
        }
      } catch (discogsError) {
        console.error("Failed to fetch from Discogs", discogsError);
        return res.status(502).json({ error: "Failed to verify record with Discogs" });
      }
    }

    // Insert or update listening to
    await pool.execute(
      `INSERT INTO ListeningTo (userUuid, masterId, created)
       VALUES (?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         masterId = VALUES(masterId),
         created = UTC_TIMESTAMP()`,
      [req.userUuid, masterId]
    );

    res.json({
      success: true,
      listeningTo: { artist, cover, name, masterId },
    });
  } catch (error) {
    console.error("Failed to update listening to", error);
    res.status(500).json({ error: "Failed to update listening to" });
  }
});

/**
 * DELETE /api/user/listening-to
 * Clears the user's current listening status (removes what they're currently listening to)
 * @returns {Object} {success: true} or error message
 */
app.delete("/api/user/listening-to", requireAuth, async (req, res) => {
  console.log("Clearing listening to...");
  
  try {
    const pool = await getPool();
    await pool.execute(
      `DELETE FROM ListeningTo WHERE userUuid = ?`,
      [req.userUuid]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to clear listening to", error);
    res.status(500).json({ error: "Failed to clear listening to" });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
