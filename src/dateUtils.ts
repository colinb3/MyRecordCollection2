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
