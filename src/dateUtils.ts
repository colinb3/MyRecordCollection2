const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const SPACE_SEPARATED_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([zZ]|[+-]\d{2}:?\d{2})?$/;
const TIMEZONE_SUFFIX_PATTERN = /([zZ]|[+-]\d{2}:?\d{2})$/;

function normalizeToIsoUtc(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let normalized = trimmed;

  if (SPACE_SEPARATED_PATTERN.test(normalized)) {
    normalized = normalized.replace(" ", "T");
  }

  if (DATE_ONLY_PATTERN.test(normalized)) {
    return `${normalized}T00:00:00Z`;
  }

  const hasTime = TIME_PREFIX_PATTERN.test(normalized);
  const hasZone = TIMEZONE_SUFFIX_PATTERN.test(normalized);

  if (hasTime && !hasZone) {
    return `${normalized}Z`;
  }

  return normalized;
}

export function parseUtcDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = normalizeToIsoUtc(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const noYearDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const defaultDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const defaultDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatLocalDate(
  value: string | null | undefined,
  formatter?: Intl.DateTimeFormat
): string | null {
  const parsed = parseUtcDate(value);
  if (!parsed) return null;
  return (formatter ?? defaultDateFormatter).format(parsed);
}

export function formatLocalDateTime(
  value: string | null | undefined,
  formatter?: Intl.DateTimeFormat
): string | null {
  const parsed = parseUtcDate(value);
  if (!parsed) return null;
  return (formatter ?? defaultDateTimeFormatter).format(parsed);
}

export function formatRelativeTime(
  value: string | null | undefined
): string | null {
  const parsed = parseUtcDate(value);
  if (!parsed) return null;

  // Get current time in UTC to match the parsed UTC time
  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffYears = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));

  // Last hour: "x minutes ago"
  if (diffMinutes < 60) {
    if (diffMinutes < 1) return "just now";
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  }

  // Last day: "x hours ago"
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }

  // Last week: "x days ago"
  if (diffDays < 7) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  }

  // Last week: "x days ago"
  if (diffYears < 1) {
    return noYearDateFormatter.format(parsed);
  }

  // Otherwise, show the formatted date
  return defaultDateFormatter.format(parsed);
}
