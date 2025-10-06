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
const PROFILE_PIC_SIZE_LIMIT = Number(process.env.PROFILE_PIC_MAX_BYTES || 5 * 1024 * 1024);
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
const MAX_PROFILE_HIGHLIGHTS = 4;
const PROFILE_RECENT_DEFAULT_LIMIT = 4;
const PROFILE_RECENT_MAX_LIMIT = 20;

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

function normalizeFollowCount(value) {
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

const RECORD_TABLE_COLUMN_KEYS = [
  "cover",
  "record",
  "artist",
  "rating",
  "tags",
  "release",
  "dateAdded",
];
const SORTABLE_RECORD_TABLE_COLUMN_KEYS = [
  "record",
  "artist",
  "rating",
  "release",
  "dateAdded",
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
      dateAdded: true,
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
    `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as dateAdded, r.tableId, t.name as collectionName
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

function escapeForLike(term) {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
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

async function getUserTableId(pool, userUuid, tableName) {
  const [rows] = await pool.execute(
    `SELECT id FROM RecTable WHERE userUuid = ? AND name = ? LIMIT 1`,
    [userUuid, tableName]
  );
  return rows.length > 0 ? rows[0].id : null;
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
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userUuid = payload.userUuid;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/api/records", requireAuth, async (req, res) => {
  console.log("Fetching records...");
  const tableName = typeof req.query.table === "string" ? req.query.table : null;
  if (!tableName) {
    return res.status(400).json({ error: "table query parameter required" });
  }
  try {
    const pool = await getPool();
    const tableId = await getUserTableId(pool, req.userUuid, tableName);
    if (!tableId) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const [rows] = await pool.query(
      `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as dateAdded, r.tableId
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
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/profile/recent", requireAuth, async (req, res) => {
  console.log("Fetching recent profile records...");
  try {
    const rawLimit = Number(req.query.limit);
    let limit = PROFILE_RECENT_DEFAULT_LIMIT;
    if (Number.isInteger(rawLimit) && rawLimit > 0) {
      limit = Math.min(rawLimit, PROFILE_RECENT_MAX_LIMIT);
    }

    const pool = await getPool();
    // Only include records that are in the user's default collection (RecTable.name = DEFAULT_COLLECTION_NAME)
    const [rows] = await pool.query(
      `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as dateAdded, r.tableId
       FROM Record r
       JOIN RecTable t ON r.tableId = t.id
       WHERE r.userUuid = ? AND t.name = ?
       ORDER BY r.added DESC
       LIMIT ?`,
      [req.userUuid, DEFAULT_COLLECTION_NAME, limit]
    );

    const recordIds = rows.map((row) => row.id);
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
      for (const tagRow of tagRows) {
        const recordId = tagRow.recordId;
        if (!tagsByRecord[recordId]) {
          tagsByRecord[recordId] = [];
        }
        tagsByRecord[recordId].push(tagRow.name);
      }
    }

    const response = rows.map((row) => ({
      ...row,
      tags: tagsByRecord[row.id] || [],
    }));

    res.json(response);
  } catch (err) {
    console.error("Failed to load recent profile records", err);
    res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/community/search", requireAuth, async (req, res) => {
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

app.get("/api/community/users/:username", requireAuth, async (req, res) => {
  console.log("Fetching public profile...");
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

    const publicUser = normalizePublicUser(userRow);

    let isFollowing = null;
    if (userRow.uuid !== req.userUuid) {
      const [followRows] = await pool.query(
        `SELECT 1 FROM Follows WHERE userUuid = ? AND followsUuid = ? LIMIT 1`,
        [req.userUuid, userRow.uuid]
      );
      isFollowing = Array.isArray(followRows) && followRows.length > 0;
    }

    const highlightIds = await getProfileHighlightIds(pool, userRow.uuid);
    const highlights = await fetchRecordsWithTagsByIds(
      pool,
      userRow.uuid,
      highlightIds
    );

    const [recentRows] = await pool.query(
      `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as dateAdded, r.tableId
       FROM Record r
       JOIN RecTable t ON r.tableId = t.id
       WHERE r.userUuid = ? AND t.name = ?
       ORDER BY r.added DESC
       LIMIT ?`,
      [userRow.uuid, DEFAULT_COLLECTION_NAME, PROFILE_RECENT_DEFAULT_LIMIT]
    );

    const recentRecordIds = recentRows.map((row) => row.id);
    const tagsByRecord = await fetchTagsByRecordIds(pool, recentRecordIds);
    const recentRecords = recentRows.map((row) => ({
      ...row,
      tags: tagsByRecord[row.id] || [],
    }));

    res.json({
      ...publicUser,
      highlights,
      recentRecords,
      isFollowing,
    });
  } catch (error) {
    console.error("Failed to load public profile", error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.get(
  "/api/community/users/:username/collection",
  requireAuth,
  async (req, res) => {
    console.log("Fetching public collection...");
    const targetUsername = req.params.username;
    if (!targetUsername) {
      return res.status(400).json({ error: "Username is required" });
    }
    const rawTable =
      typeof req.query.table === "string" && req.query.table.trim()
        ? req.query.table.trim()
        : DEFAULT_COLLECTION_NAME;
    try {
      const pool = await getPool();
      const userRow = await getUserByUsername(pool, targetUsername);
      if (!userRow) {
        return res.status(404).json({ error: "User not found" });
      }

      const tableId = await getUserTableId(pool, userRow.uuid, rawTable);
      if (!tableId) {
        return res.status(404).json({ error: "Collection not found" });
      }

      const [rows] = await pool.query(
        `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as dateAdded, r.tableId
         FROM Record r WHERE r.userUuid = ? AND r.tableId = ?`,
        [userRow.uuid, tableId]
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
  "/api/community/users/:username/follows",
  requireAuth,
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

app.get("/api/community/feed", requireAuth, async (req, res) => {
  console.log("Fetching community feed...");
  try {
    const pool = await getPool();
    const [rows] = await pool.query(
      `SELECT r.id, r.name as record, r.artist, r.cover, r.rating,
              r.release_year as 'release', r.added as dateAdded, r.tableId,
              u.username, u.displayName, u.profilePic
       FROM Record r
       JOIN Follows f ON f.followsUuid = r.userUuid
       JOIN User u ON u.uuid = r.userUuid
       JOIN RecTable t ON r.tableId = t.id
       WHERE f.userUuid = ? AND t.name = ?
       ORDER BY r.added DESC, r.id DESC
       LIMIT 20`,
      [req.userUuid, DEFAULT_COLLECTION_NAME]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.json([]);
    }

    const recordIds = rows.map((row) => row.id);
    const tagsByRecord = await fetchTagsByRecordIds(pool, recordIds);

    const feed = rows.map((row) => {
      const displayName =
        typeof row.displayName === "string" && row.displayName.trim()
          ? row.displayName.trim()
          : null;
      const ratingRaw = Number(row.rating);
      const rating = Number.isFinite(ratingRaw) ? ratingRaw : 0;
      const releaseRaw = Number(row.release);
      const release = Number.isFinite(releaseRaw) ? releaseRaw : 0;
      const dateAddedValue = row.dateAdded;
      const dateAdded =
        dateAddedValue instanceof Date
          ? dateAddedValue.toISOString().slice(0, 10)
          : dateAddedValue;
      const cover =
        typeof row.cover === "string" && row.cover ? row.cover : undefined;
      const tags = tagsByRecord[row.id] || [];

      const record = {
        id: row.id,
        record: row.record,
        artist: row.artist,
        rating,
        release,
        dateAdded,
        tags,
        tableId: row.tableId,
      };

      if (cover) {
        record.cover = cover;
      }

      return {
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
    console.error("Failed to load community feed", error);
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
          `INSERT INTO Follows (userUuid, followsUuid) VALUES (?, ?)`,
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
      'INSERT INTO User (uuid, username, displayName, password, bio, profilePic) VALUES (?, ?, ?, ?, ?, ?)',
      [userUuid, username, displayName, hashedPassword, null, null]
    );
    await pool.execute(
      `INSERT INTO RecTable (name, userUuid) VALUES (?, ?), (?, ?)`,
      ["My Collection", userUuid, "Wishlist", userUuid]
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
  res.cookie('token', token, { httpOnly: true, sameSite: process.env.CROSS_SITE_COOKIES === 'true' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7*24*60*60*1000 });
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
      `SELECT u.username, u.displayName, u.bio, u.profilePic, u.created,
              (SELECT COUNT(*) FROM Follows WHERE followsUuid = u.uuid) AS followersCount,
              (SELECT COUNT(*) FROM Follows WHERE userUuid = u.uuid) AS followingCount
       FROM User u
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
    res.json({
      username: userRow.username,
      displayName: userRow.displayName,
      bio: userRow.bio ?? null,
      profilePicUrl,
      userUuid: req.userUuid,
      followersCount,
      followingCount,
      joinedDate: normalizeDateOnly(userRow.created),
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

// Create or update a record
app.post('/api/records/update', requireAuth, async (req, res) => {
  console.log("Updating record...");
  const { id, record, artist, cover, rating, tags, release } = req.body;
  if (!id || !record) return res.status(400).json({ error: 'Missing id or record name' });
  // Validate release year
  const releaseNum = Number(release);
  if (!Number.isInteger(releaseNum) || releaseNum < 1877 || releaseNum > 2100) {
    return res.status(400).json({ error: 'Invalid release year' });
  }
  try {
    const pool = await getPool();
    // Update main record and ensure it belongs to the authenticated user.
    const [updateResult] = await pool.execute(
      `UPDATE Record SET name = ?, artist = ?, cover = ?, rating = ?, release_year = ? WHERE id = ? AND userUuid = ?`,
      [record, artist, cover, rating, releaseNum, id, req.userUuid]
    );
    if (!updateResult || updateResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    // Remove old tags for this record (safe because we own the record)
    await pool.execute(`DELETE FROM Tagged WHERE recordId = ?`, [id]);
    // Add new tags (create if missing)
    for (const tagName of tags || []) {
      let [tagRows] = await pool.execute(`SELECT id FROM Tag WHERE name = ? AND userUuid = ?`, [tagName, req.userUuid]);
      let tagId;
      if (tagRows.length === 0) {
        const [result] = await pool.execute(`INSERT INTO Tag (name, userUuid) VALUES (?, ?)`, [tagName, req.userUuid]);
        tagId = result.insertId;
      } else {
        tagId = tagRows[0].id;
      }
      await pool.execute(`INSERT IGNORE INTO Tagged (recordId, tagId) VALUES (?, ?)`, [id, tagId]);
    }
    // Return updated record
    const [rows] = await pool.execute(
      `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as dateAdded, r.tableId FROM Record r WHERE r.id = ? AND r.userUuid = ?`,
      [id, req.userUuid]
    );
    const updated = rows[0];
    // Get tags
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
  if (!record) return res.status(400).json({ error: 'Missing record name' });
  if (!tableName || typeof tableName !== 'string') {
    return res.status(400).json({ error: 'tableName is required' });
  }
  // Validate release year
  const releaseNum = Number(release);
  if (!Number.isInteger(releaseNum) || releaseNum < 1877 || releaseNum > 2100) {
    return res.status(400).json({ error: 'invalid release year' });
  }
  try {
    const pool = await getPool();
    const tableId = await getUserTableId(pool, req.userUuid, tableName);
    if (!tableId) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const [result] = await pool.execute(
      `INSERT INTO Record (name, artist, cover, rating, release_year, tableId, userUuid, added) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [record, artist, cover, rating, releaseNum, tableId, req.userUuid]
    );
    const newId = result.insertId;
    // Add tags (create if missing)
    for (const tagName of tags || []) {
      let [tagRows] = await pool.execute(`SELECT id FROM Tag WHERE name = ? AND userUuid = ?`, [tagName, req.userUuid]);
      let tagId;
      if (tagRows.length === 0) {
        const [tagResult] = await pool.execute(`INSERT INTO Tag (name, userUuid) VALUES (?, ?)`, [tagName, req.userUuid]);
        tagId = tagResult.insertId;
      } else {
        tagId = tagRows[0].id;
      }
      await pool.execute(`INSERT IGNORE INTO Tagged (recordId, tagId) VALUES (?, ?)`, [newId, tagId]);
    }
    // Return new record
    const [rows] = await pool.execute(
      `SELECT r.id, r.name as record, r.artist, r.cover, r.rating, r.release_year as 'release', r.added as dateAdded, r.tableId FROM Record r WHERE r.id = ? AND r.userUuid = ?`,
      [newId, req.userUuid]
    );
    const created = rows[0];
    // Get tags
    const [tagRows] = await pool.execute(
      `SELECT t.name FROM Tag t JOIN Tagged tg ON t.id = tg.tagId WHERE tg.recordId = ?`,
      [newId]
    );
    created.tags = tagRows.map((t) => t.name);
    res.json(created);
  } catch (err) {
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
    await pool.execute(`INSERT INTO Tag (name, userUuid) VALUES (?, ?)`, [trimmed, req.userUuid]);
    const [rows] = await pool.execute(`SELECT name FROM Tag WHERE userUuid = ? ORDER BY name`, [req.userUuid]);
    res.json({ tags: rows.map(r => r.name) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

app.post('/api/tags/rename', requireAuth, async (req, res) => {
  console.log('Renaming tag...');
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ error: 'oldName and newName required' });
  try {
    const pool = await getPool();
    const trimmedNew = newName.trim();
    if (!trimmedNew) return res.status(400).json({ error: 'New name cannot be empty' });
    const [dup] = await pool.execute(`SELECT id FROM Tag WHERE name = ? AND userUuid = ?`, [trimmedNew, req.userUuid]);
    if (dup.length > 0) return res.status(409).json({ error: 'A tag with that name already exists' });
    const [result] = await pool.execute(`UPDATE Tag SET name = ? WHERE name = ? AND userUuid = ?`, [trimmedNew, oldName, req.userUuid]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Tag not found' });
    const [rows] = await pool.execute(`SELECT name FROM Tag WHERE userUuid = ? ORDER BY name`, [req.userUuid]);
    res.json({ tags: rows.map(r => r.name) });
  } catch (err) {
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
      let release = Number.isInteger(releaseNum) ? releaseNum : 1900;
      if (release < 1877 || release > 2100) {
        release = 1900;
      }

      const ratingNum = Number(raw.rating);
      let rating = Number.isFinite(ratingNum) ? Math.round(ratingNum) : 0;
      if (rating < 0) rating = 0;
      if (rating > 10) rating = 10;

      const dateVal = typeof raw.dateAdded === 'string' ? raw.dateAdded.trim() : '';
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

      const addedDate = dateAdded || new Date().toISOString().slice(0, 10);
      const [insertResult] = await pool.execute(
        `INSERT INTO Record (name, artist, cover, rating, release_year, tableId, userUuid, added) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [recordName, artist, cover || null, rating, release, tableId, req.userUuid, addedDate]
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
              `INSERT INTO Tag (name, userUuid) VALUES (?, ?)`,
              [tagName, req.userUuid]
            );
            tagId = tagInsert.insertId;
          }
          tagCache.set(cacheKey, tagId);
        }
        await pool.execute(
          `INSERT IGNORE INTO Tagged (recordId, tagId) VALUES (?, ?)`,
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
app.get('/api/lastfm/album.search', requireAuth, async (req, res) => {
  console.log("Proxying Last.fm album.search...");
  const { q } = req.query;
  if (!q || typeof q !== 'string') return res.status(400).json({ error: 'Missing q param' });
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing LASTFM_API_KEY on server' });
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=album.search&album=${encodeURIComponent(q)}&api_key=${apiKey}&format=json&limit=10`;
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text();
      console.error('Last.fm upstream error', r.status, body);
      return res.status(502).json({ error: 'Last.fm upstream failure', status: r.status });
    }
    const data = await r.json();
    res.json(data);
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
      `UPDATE Record SET tableId = ? WHERE id = ? AND userUuid = ?`,
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

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
