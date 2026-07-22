import { supabase } from "@/app/lib/SupabaseClient";

export type BannerLogType = "close_banner" | "book_call";
export type BannerTypeFilter = "all" | BannerLogType;
export type AnalyticsDays = 5 | 30 | 180;

export type DayBucket = {
  date: string;
  close_banner: number;
  book_call: number;
  total: number;
};

export type DayKpis = {
  date: string;
  total: number;
  booked: number;
  closed: number;
};

type LogRow = {
  type: string | null;
  created_at: string;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function getRomeYmd(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);

  return {
    year: num("year"),
    month: num("month"),
    day: num("day"),
  };
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getTodayRomeYmd(now = new Date()): string {
  const { year, month, day } = getRomeYmd(now);
  return formatYmd(year, month, day);
}

/** Inizio del giorno di calendario Europe/Rome `daysAgo` giorni fa (0 = oggi). */
function romeDayStartUtc(daysAgo: number, now = new Date()): Date {
  const today = getRomeYmd(now);
  const d = new Date(Date.UTC(today.year, today.month - 1, today.day));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  const ymd = formatYmd(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate()
  );
  return new Date(`${ymd}T00:00:00+01:00`);
}

function ymdStartUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+01:00`);
}

function toRomeDateKey(iso: string): string {
  const { year, month, day } = getRomeYmd(new Date(iso));
  return formatYmd(year, month, day);
}

function buildEmptyBuckets(days: number, now = new Date()): DayBucket[] {
  const today = getRomeYmd(now);
  const buckets: DayBucket[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day));
    d.setUTCDate(d.getUTCDate() - i);
    buckets.push({
      date: formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      close_banner: 0,
      book_call: 0,
      total: 0,
    });
  }

  return buckets;
}

async function fetchRowsSince(sinceIso: string): Promise<LogRow[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: LogRow[] = [];

  for (;;) {
    const { data, error } = await supabase
      .from("log_md_banner")
      .select("type, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = (data ?? []) as LogRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export function parseAnalyticsDays(value: string | undefined): AnalyticsDays {
  if (value === "5" || value === "30" || value === "180") {
    return Number(value) as AnalyticsDays;
  }
  return 30;
}

export function parseTypeFilter(value: string | undefined): BannerTypeFilter {
  if (value === "close_banner" || value === "book_call") return value;
  return "all";
}

export function parseKpiDate(value: string | undefined, now = new Date()): string {
  const today = getTodayRomeYmd(now);
  if (!value || !YMD_RE.test(value)) return today;
  if (value > today) return today;
  return value;
}

export async function fetchMdBannerAnalytics(options: {
  days: AnalyticsDays;
  type: BannerTypeFilter;
  kpiDate: string;
}): Promise<{
  series: DayBucket[];
  dayKpis: DayKpis;
}> {
  const now = new Date();
  const chartSince = romeDayStartUtc(options.days - 1, now);
  const kpiSince = ymdStartUtc(options.kpiDate);
  const querySince =
    chartSince.getTime() <= kpiSince.getTime() ? chartSince : kpiSince;

  const rows = await fetchRowsSince(querySince.toISOString());

  const buckets = buildEmptyBuckets(options.days, now);
  const byDate = new Map(buckets.map((b) => [b.date, b]));

  const dayKpis: DayKpis = {
    date: options.kpiDate,
    total: 0,
    booked: 0,
    closed: 0,
  };

  for (const row of rows) {
    const key = toRomeDateKey(row.created_at);
    const isClose = row.type === "close_banner";
    const isBook = row.type === "book_call";

    if (key === options.kpiDate) {
      if (isClose) dayKpis.closed += 1;
      if (isBook) dayKpis.booked += 1;
      if (isClose || isBook) dayKpis.total += 1;
    }

    const bucket = byDate.get(key);
    if (!bucket) continue;

    if (options.type === "close_banner" && !isClose) continue;
    if (options.type === "book_call" && !isBook) continue;

    if (isClose) bucket.close_banner += 1;
    if (isBook) bucket.book_call += 1;
    if (isClose || isBook) bucket.total += 1;
  }

  return { series: buckets, dayKpis };
}
