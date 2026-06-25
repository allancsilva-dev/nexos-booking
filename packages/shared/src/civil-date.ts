const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseCivilDateParts(value: string): { year: number; month: number; day: number } {
  if (!CIVIL_DATE.test(value)) {
    throw new TypeError(`Expected YYYY-MM-DD, received: ${value}`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month! - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new TypeError(`Expected a real civil date, received: ${value}`);
  }

  return { year: year!, month: month!, day: day! };
}

function formatCivilDateParts(
  year: number,
  month: number,
  day: number,
): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getTimeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(instant);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = offset.match(/^GMT([+-])(\d{2})(?::?(\d{2}))?$/);
  if (!match) return 0;

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function getZonedDateTimeParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(instant);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
    hour: Number(parts.find((part) => part.type === "hour")?.value),
    minute: Number(parts.find((part) => part.type === "minute")?.value),
    second: Number(parts.find((part) => part.type === "second")?.value),
  };
}

export function isCivilDate(value: string): boolean {
  try {
    parseCivilDateParts(value);
    return true;
  } catch {
    return false;
  }
}

export function assertCivilDate(value: string): string {
  parseCivilDateParts(value);
  return value;
}

export function addCivilDays(value: string, amount: number): string {
  const { year, month, day } = parseCivilDateParts(value);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return formatCivilDateParts(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
}

export function zonedDateTimeToInstant(
  civilDate: string,
  wallTime: string,
  timeZone: string,
): Date {
  const { year, month, day } = parseCivilDateParts(civilDate);
  const [hourStr, minuteStr, secondStr = "00"] = wallTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  for (let attempt = 0; attempt < 4; attempt++) {
    const zoned = getZonedDateTimeParts(guess, timeZone);
    const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const zonedUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    );
    const diffMs = desiredUtc - zonedUtc;
    if (diffMs === 0) {
      return guess;
    }
    guess = new Date(guess.getTime() + diffMs);
  }

  return guess;
}

export function civilDateStartToInstant(civilDate: string, timeZone: string): Date {
  return zonedDateTimeToInstant(civilDate, "00:00:00", timeZone);
}

export function instantToCivilDate(instant: Date, timeZone: string): string {
  const zoned = getZonedDateTimeParts(instant, timeZone);
  return formatCivilDateParts(zoned.year, zoned.month, zoned.day);
}

export function formatInstantWithOffset(instant: Date, timeZone: string): string {
  const zoned = getZonedDateTimeParts(instant, timeZone);
  const offsetMinutes = getTimeZoneOffsetMinutes(instant, timeZone);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absOffset / 60);
  const offsetRemainder = absOffset % 60;

  return `${formatCivilDateParts(zoned.year, zoned.month, zoned.day)}T${String(zoned.hour).padStart(2, "0")}:${String(zoned.minute).padStart(2, "0")}:${String(zoned.second).padStart(2, "0")}${sign}${String(offsetHours).padStart(2, "0")}:${String(offsetRemainder).padStart(2, "0")}`;
}
