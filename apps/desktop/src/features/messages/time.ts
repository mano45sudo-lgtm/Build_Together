/**
 * Time formatting for the message stream. Kept dependency-free and locale-stable so the chat reads
 * the same regardless of host region (system fonts, no emoji). All inputs are epoch milliseconds
 * from the provider (`sentTime`).
 */

/** Short clock label for a single message, e.g. `14:05`. */
export function formatClock(sentAt: number): string {
  const d = new Date(sentAt);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function startOfDay(sentAt: number): number {
  const d = new Date(sentAt);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Calendar bucket used to insert day dividers between message groups. */
export function dayKey(sentAt: number): number {
  return startOfDay(sentAt);
}

/** Human day label for a divider: Today / Yesterday / weekday / full date (oldest). */
export function formatDayLabel(sentAt: number): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(sentAt);
  const diffDays = Math.round((today - day) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const d = new Date(sentAt);
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
