"use client";

export type WorkingWindow = {
  startMin: number;
  endMin: number;
};

function toCivilDateUtcNoon(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12));
}

function getFormatter(
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale, { timeZone, ...options });
}

export function getCivilDateInTimeZone(date: Date, timeZone: string): string {
  return getFormatter("en-CA", timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDaysToCivilDate(dateStr: string, delta: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + delta));
  return utc.toISOString().slice(0, 10);
}

export function getWeekdayFromCivilDate(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

export function getStartOfWeek(dateStr: string): string {
  const weekday = getWeekdayFromCivilDate(dateStr);
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDaysToCivilDate(dateStr, delta);
}

export function getWeekDates(dateStr: string): string[] {
  const weekStart = getStartOfWeek(dateStr);
  return Array.from({ length: 7 }, (_, index) => addDaysToCivilDate(weekStart, index));
}

export function formatScheduleHeading(dateStr: string, timeZone: string, viewMode: "day" | "week" = "day") {
  const date = toCivilDateUtcNoon(dateStr);
  if (viewMode === "week") {
    const weekDates = getWeekDates(dateStr);
    const weekStart = toCivilDateUtcNoon(weekDates[0]!);
    const weekEnd = toCivilDateUtcNoon(weekDates[6]!);
    const sameMonth = weekStart.getUTCMonth() === weekEnd.getUTCMonth();
    const sameYear = weekStart.getUTCFullYear() === weekEnd.getUTCFullYear();

    const startDay = getFormatter("pt-BR", timeZone, { day: "2-digit" }).format(weekStart);
    const endDay = getFormatter("pt-BR", timeZone, { day: "2-digit" }).format(weekEnd);
    const startMonth = getFormatter("pt-BR", timeZone, { month: "long" }).format(weekStart);
    const endMonth = getFormatter("pt-BR", timeZone, { month: "long" }).format(weekEnd);
    const endYear = getFormatter("pt-BR", timeZone, { year: "numeric" }).format(weekEnd);

    return {
      title: sameMonth
        ? `${startDay}–${endDay} de ${startMonth}`
        : `${startDay} de ${startMonth} – ${endDay} de ${endMonth}`,
      subtitle: sameYear ? `Semana de ${endYear}` : `${weekStart.getUTCFullYear()}–${endYear}`,
    };
  }

  return {
    title: getFormatter("pt-BR", timeZone, { weekday: "long" }).format(date),
    subtitle: getFormatter("pt-BR", timeZone, {
      day: "2-digit",
      month: "long",
    }).format(date),
  };
}

export function getMinutesInTimeZone(iso: string, timeZone: string): number {
  const parts = getFormatter("en-GB", timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function formatTimeInTimeZone(iso: string, timeZone: string): string {
  return getFormatter("pt-BR", timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatCurrency(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function parseTimeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export function formatHourLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  return `${String(hour).padStart(2, "0")}:00`;
}

export function formatWeekdayLabel(dateStr: string, timeZone: string): string {
  return getFormatter("pt-BR", timeZone, { weekday: "short" })
    .format(toCivilDateUtcNoon(dateStr))
    .replace(".", "");
}

export function formatDayLabel(dateStr: string, timeZone: string): string {
  return getFormatter("pt-BR", timeZone, {
    day: "2-digit",
    month: "2-digit",
  }).format(toCivilDateUtcNoon(dateStr));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function buildInactiveRanges(
  startMin: number,
  endMin: number,
  windows: WorkingWindow[],
): WorkingWindow[] {
  if (windows.length === 0) {
    return [{ startMin, endMin }];
  }

  const sorted = [...windows].sort((a, b) => a.startMin - b.startMin);
  const ranges: WorkingWindow[] = [];
  let cursor = startMin;

  for (const window of sorted) {
    if (window.startMin > cursor) {
      ranges.push({ startMin: cursor, endMin: window.startMin });
    }
    cursor = Math.max(cursor, window.endMin);
  }

  if (cursor < endMin) {
    ranges.push({ startMin: cursor, endMin });
  }

  return ranges.filter((range) => range.endMin > range.startMin);
}

export function mergeWorkingWindows(windows: WorkingWindow[]): WorkingWindow[] {
  if (windows.length === 0) return [];

  const sorted = [...windows].sort((a, b) => a.startMin - b.startMin);
  const merged: WorkingWindow[] = [sorted[0]!];

  for (const window of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (window.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, window.endMin);
      continue;
    }
    merged.push({ ...window });
  }

  return merged;
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
