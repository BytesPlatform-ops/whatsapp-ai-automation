/**
 * Timezone-aware slot computation for native booking.
 *
 * All appointments are stored in UTC. The salon's IANA timezone is used only
 * to translate wall-clock opening hours into UTC instants and to render times
 * back to the customer/owner.
 */

function getTzPartsAt(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const out = {};
  for (const p of dtf.formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** tz offset (tz_wallclock − UTC_wallclock), in ms, at the given instant. */
function tzOffsetMs(date, tz) {
  const p = getTzPartsAt(date, tz);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}

/**
 * Convert a wall-clock time in the given tz to a UTC Date.
 * Uses the "interpret-as-UTC, measure offset, correct" trick, then re-measures
 * to cover DST transitions (offset near the boundary can differ from guess).
 */
function wallClockToUtc(year, month, day, hour, minute, tz) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const off1 = tzOffsetMs(guess, tz);
  const candidate = new Date(guess.getTime() - off1);
  const off2 = tzOffsetMs(candidate, tz);
  return new Date(guess.getTime() - off2);
}

/** Day-of-week key ('mon'...'sun') for a UTC date as seen in the given tz. */
function dayKeyInTz(date, tz) {
  const w = getTzPartsAt(date, tz).weekday.toLowerCase();
  return w.slice(0, 3); // "mon", "tue", ...
}

/** Render a UTC ISO time to a short local label, e.g. "14:30". */
function renderLocalHHMM(date, tz) {
  const p = getTzPartsAt(date, tz);
  return `${p.hour}:${p.minute}`;
}

function renderLocalDateTime(date, tz) {
  const p = getTzPartsAt(date, tz);
  return `${p.weekday} ${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/**
 * Generate all possible slot start times for a given local date, based on weekly hours.
 * Returns Date[] (UTC instants).
 *   slotMinutes:  grid size (e.g. 30)
 *   durationMinutes: required free window after the slot (service length)
 */
function generateSlotsForDate({ dateStr, weeklyHours, timezone, slotMinutes, durationMinutes }) {
  // dateStr is YYYY-MM-DD in the salon's local calendar.
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return [];

  // Determine the day-of-week in tz by anchoring to local noon (avoids DST edge cases).
  const noon = wallClockToUtc(y, m, d, 12, 0, timezone);
  const key = dayKeyInTz(noon, timezone);
  const windows = (weeklyHours && weeklyHours[key]) || [];
  if (windows.length === 0) return [];

  const slots = [];
  const nowMs = Date.now();

  for (const w of windows) {
    const [oh, om] = w.open.split(':').map((n) => parseInt(n, 10));
    const [ch, cm] = w.close.split(':').map((n) => parseInt(n, 10));
    const openUtc = wallClockToUtc(y, m, d, oh, om, timezone);
    const closeUtc = wallClockToUtc(y, m, d, ch, cm, timezone);
    // Last acceptable slot start = close − duration.
    const lastStart = closeUtc.getTime() - durationMinutes * 60 * 1000;

    for (let t = openUtc.getTime(); t <= lastStart; t += slotMinutes * 60 * 1000) {
      if (t < nowMs) continue; // skip past slots
      slots.push(new Date(t));
    }
  }
  return slots;
}

/**
 * Filter candidate slots against existing appointments. A slot is blocked if
 * its [start, start+duration) overlaps any confirmed appointment.
 */
function filterAgainstAppointments(slots, appointments, durationMinutes) {
  const blocks = appointments.map((a) => ({
    start: new Date(a.start_at).getTime(),
    end: new Date(a.end_at).getTime(),
  }));
  return slots.filter((s) => {
    const start = s.getTime();
    const end = start + durationMinutes * 60 * 1000;
    return !blocks.some((b) => start < b.end && end > b.start);
  });
}

module.exports = {
  wallClockToUtc,
  tzOffsetMs,
  dayKeyInTz,
  renderLocalHHMM,
  renderLocalDateTime,
  generateSlotsForDate,
  filterAgainstAppointments,
};
