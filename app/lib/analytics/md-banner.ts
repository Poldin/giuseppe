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

export type YesterdayKpis = {
  date: string;
  total: number;
  booked: number;
  closed: number;
};

type LogRow = {
  type: string | null;
  created_at: string;
};

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

/** Inizio UTC del giorno di calendario Europe/Rome `daysAgo` giorni fa (0 = oggi). */
function romeDayStartUtc(daysAgo: number, now = new Date()): Date {
  const today = getRomeYmd(now);
  const d = new Date(Date.UTC(today.year, today.month - 1, today.day));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  // Europe/Rome offset approximation via formatter: get the instant that is 00:00 Rome
  // by formatting candidates is heavy; for aggregation we only need inclusive date keys.
  // Query window: start of that Rome calendar day ≈ UTC midnight of the YMD (winter)
  // or -1h/+2h — safest: use noon UTC of previous calendar trick.
  // We store created_at as timestamptz; filter with YMD string cast is cleaner via ISO.
  // Use local Rome midnight expressed as ISO by constructing from parts with offset guess.
  const ymd = formatYmd(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate()
  );
  // Midnight Rome ≈ ymdT00:00:00+01:00 or +02:00; using +01:00 errs early by 1h in summer
  // which still includes the full day when we also filter by formatted date key.
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

export async function fetchMdBannerAnalytics(options: {
  days: AnalyticsDays;
  type: BannerTypeFilter;
}): Promise<{
  series: DayBucket[];
  yesterday: YesterdayKpis;
}> {
  const now = new Date();
  const since = romeDayStartUtc(options.days - 1, now);
  // Also need yesterday for KPIs — included if days >= 2; always fetch at least 2 days window
  const kpiSince = romeDayStartUtc(Math.max(options.days - 1, 1), now);
  const querySince =
    since.getTime() <= kpiSince.getTime() ? since : kpiSince;

  const rows = await fetchRowsSince(querySince.toISOString());

  const buckets = buildEmptyBuckets(options.days, now);
  const byDate = new Map(buckets.map((b) => [b.date, b]));

  const today = getRomeYmd(now);
  const yesterdayDate = new Date(
    Date.UTC(today.year, today.month - 1, today.day)
  );
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterdayKey = formatYmd(
    yesterdayDate.getUTCFullYear(),
    yesterdayDate.getUTCMonth() + 1,
    yesterdayDate.getUTCDate()
  );

  const yesterday: YesterdayKpis = {
    date: yesterdayKey,
    total: 0,
    booked: 0,
    closed: 0,
  };

  for (const row of rows) {
    const key = toRomeDateKey(row.created_at);
    const isClose = row.type === "close_banner";
    const isBook = row.type === "book_call";

    if (key === yesterdayKey) {
      if (isClose) yesterday.closed += 1;
      if (isBook) yesterday.booked += 1;
      if (isClose || isBook) yesterday.total += 1;
    }

    const bucket = byDate.get(key);
    if (!bucket) continue;

    if (options.type === "close_banner" && !isClose) continue;
    if (options.type === "book_call" && !isBook) continue;

    if (isClose) bucket.close_banner += 1;
    if (isBook) bucket.book_call += 1;
    if (isClose || isBook) bucket.total += 1;
  }

  return { series: buckets, yesterday };
}
