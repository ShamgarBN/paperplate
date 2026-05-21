// Convert ISO 8601 durations (e.g., "PT1H30M", "PT45M") and free-form English
// time phrases ("1 hour 15 minutes", "45 mins") to total minutes.

export function parseDurationMinutes(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.max(0, Math.round(input));
  }
  const text = String(input).trim();
  if (!text) return null;

  // ISO 8601 form: PT[xH][yM][zS]
  const iso = text.match(
    /^P(?:(?<days>\d+)D)?T?(?:(?<hours>\d+)H)?(?:(?<minutes>\d+)M)?(?:(?<seconds>\d+)S)?$/i,
  );
  if (iso?.groups) {
    const { days, hours, minutes, seconds } = iso.groups;
    let total = 0;
    if (days) total += Number(days) * 60 * 24;
    if (hours) total += Number(hours) * 60;
    if (minutes) total += Number(minutes);
    if (seconds) total += Math.round(Number(seconds) / 60);
    if (total > 0) return total;
  }

  // Free-form: "1 hour 30 minutes", "1h 30m", "45 mins", etc.
  const tokens = text.toLowerCase();
  let total = 0;
  let matched = false;
  const hourMatch = tokens.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (hourMatch) {
    total += Number(hourMatch[1]) * 60;
    matched = true;
  }
  const minMatch = tokens.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (minMatch) {
    total += Number(minMatch[1]);
    matched = true;
  }
  if (matched) return Math.round(total);

  // Fallback: bare integer is treated as minutes.
  const bare = tokens.match(/^(\d+)$/);
  if (bare) return Number(bare[1]);

  return null;
}
