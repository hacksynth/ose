export function getChinaDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getChinaWeekday(date: Date) {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[short] ?? 0;
}

function nextChinaDateKey(key: string) {
  const next = new Date(`${key}T00:00:00+08:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  return getChinaDateKey(next);
}

export function getTodayRange() {
  const todayKey = getChinaDateKey(new Date());
  const tomorrowKey = nextChinaDateKey(todayKey);
  return {
    start: new Date(`${todayKey}T00:00:00+08:00`),
    end: new Date(`${tomorrowKey}T00:00:00+08:00`),
  };
}

export function getContinuousDays(dates: Date[]) {
  const dateKeys = new Set(dates.map(getChinaDateKey));
  let cursor = new Date();
  let streak = 0;
  while (dateKeys.has(getChinaDateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}

export function getLongestStreak(dates: Date[]) {
  const keys = Array.from(new Set(dates.map(getChinaDateKey))).sort();
  let longest = 0;
  let current = 0;
  let previousKey: string | null = null;
  for (const key of keys) {
    current = previousKey && nextChinaDateKey(previousKey) === key ? current + 1 : 1;
    longest = Math.max(longest, current);
    previousKey = key;
  }
  return longest;
}

export function getRecentDateKeys(days: number) {
  const todayKey = getChinaDateKey(new Date());
  const base = new Date(`${todayKey}T00:00:00+08:00`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(base);
    date.setUTCDate(date.getUTCDate() - (days - 1 - index));
    return getChinaDateKey(date);
  });
}

function daysBetweenChinaKeys(fromKey: string, toKey: string) {
  const fromMs = new Date(`${fromKey}T00:00:00+08:00`).getTime();
  const toMs = new Date(`${toKey}T00:00:00+08:00`).getTime();
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function getNextExamCountdown(now = new Date(), targetDate?: Date | null) {
  const todayKey = getChinaDateKey(now);
  if (targetDate) {
    return { date: targetDate, days: Math.max(0, daysBetweenChinaKeys(todayKey, getChinaDateKey(targetDate))) };
  }
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric" }).format(now));
  const candidates = [year, year + 1].flatMap((candidateYear) => [5, 11].map((month) => getThirdSaturday(candidateYear, month)));
  const current = now.getTime();
  const target = candidates.find((date) => date.getTime() >= current) ?? candidates[candidates.length - 1];
  const targetKey = getChinaDateKey(target);
  return {
    date: target,
    days: Math.max(0, daysBetweenChinaKeys(todayKey, targetKey)),
  };
}

function getThirdSaturday(year: number, month: number) {
  const firstOfMonth = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+08:00`);
  const weekday = getChinaWeekday(firstOfMonth);
  const firstSaturdayDay = 1 + ((6 - weekday + 7) % 7);
  const thirdSaturdayDay = firstSaturdayDay + 14;
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(thirdSaturdayDay).padStart(2, "0")}T00:00:00+08:00`);
}
