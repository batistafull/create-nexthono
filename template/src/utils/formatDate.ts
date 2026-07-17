/** Formats an ISO date string as a short, locale-aware date-time. */
export function formatDate(iso: string, locale = "es-ES"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
