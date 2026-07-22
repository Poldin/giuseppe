import {
  fetchMdBannerAnalytics,
  parseAnalyticsDays,
  parseTypeFilter,
  type AnalyticsDays,
  type BannerTypeFilter,
  type DayBucket,
} from "@/app/lib/analytics/md-banner";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Analytics banner MD",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ days?: string; type?: string }>;
};

const DAY_OPTIONS: AnalyticsDays[] = [5, 30, 180];
const TYPE_OPTIONS: { value: BannerTypeFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "book_call", label: "Booked" },
  { value: "close_banner", label: "Closed" },
];

function hrefFor(days: AnalyticsDays, type: BannerTypeFilter) {
  return `/analytics?days=${days}&type=${type}`;
}

function formatDayLabel(ymd: string, compact: boolean) {
  const [, m, d] = ymd.split("-");
  if (compact) return `${Number(d)}/${Number(m)}`;
  return `${d}/${m}`;
}

function FrequencyChart({
  series,
  type,
}: {
  series: DayBucket[];
  type: BannerTypeFilter;
}) {
  const max = Math.max(
    1,
    ...series.map((d) =>
      type === "all"
        ? d.total
        : type === "book_call"
          ? d.book_call
          : d.close_banner
    )
  );

  const compact = series.length > 30;
  const barGap = series.length > 60 ? 1 : series.length > 20 ? 2 : 4;

  return (
    <div className="w-full">
      <div
        className="flex h-40 items-end border-b border-zinc-200 dark:border-zinc-800"
        style={{ gap: barGap }}
      >
        {series.map((day) => {
          const bookedH = (day.book_call / max) * 100;
          const closedH = (day.close_banner / max) * 100;
          const single =
            type === "book_call"
              ? day.book_call
              : type === "close_banner"
                ? day.close_banner
                : day.total;
          const singleH = (single / max) * 100;

          return (
            <div
              key={day.date}
              className="flex min-w-0 flex-1 flex-col justify-end"
              title={`${day.date}: ${day.book_call} booked · ${day.close_banner} closed`}
            >
              {type === "all" ? (
                <div className="flex w-full flex-col justify-end" style={{ height: "100%" }}>
                  <div
                    className="w-full bg-[#007A6B]"
                    style={{ height: `${bookedH}%`, minHeight: day.book_call ? 2 : 0 }}
                  />
                  <div
                    className="w-full bg-zinc-400 dark:bg-zinc-600"
                    style={{ height: `${closedH}%`, minHeight: day.close_banner ? 2 : 0 }}
                  />
                </div>
              ) : (
                <div
                  className={`w-full ${type === "book_call" ? "bg-[#007A6B]" : "bg-zinc-400 dark:bg-zinc-600"}`}
                  style={{ height: `${singleH}%`, minHeight: single ? 2 : 0 }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-zinc-500" style={{ gap: barGap }}>
        <span>{formatDayLabel(series[0]?.date ?? "", compact)}</span>
        <span>{formatDayLabel(series[series.length - 1]?.date ?? "", compact)}</span>
      </div>
      {type === "all" ? (
        <div className="mt-3 flex gap-4 text-[10px] uppercase tracking-wide text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 bg-[#007A6B]" /> Booked
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 bg-zinc-400 dark:bg-zinc-600" /> Closed
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const days = parseAnalyticsDays(params.days);
  const type = parseTypeFilter(params.type);

  let series: DayBucket[] = [];
  let yesterday = { date: "—", total: 0, booked: 0, closed: 0 };
  let error: string | null = null;

  try {
    const data = await fetchMdBannerAnalytics({ days, type });
    series = data.series;
    yesterday = data.yesterday;
  } catch (e) {
    error = e instanceof Error ? e.message : "Errore fetch";
  }

  const rangeTotal = series.reduce((sum, d) => sum + d.total, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-black uppercase tracking-tighter">
          MD Banner
        </h1>
        <p className="text-xs text-zinc-500">Ricarica per refresh</p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : (
        <>
          <section className="mb-8">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Ieri · {yesterday.date}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-3xl font-black tabular-nums tracking-tighter">
                  {yesterday.total}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Totale
                </p>
              </div>
              <div>
                <p className="text-3xl font-black tabular-nums tracking-tighter text-[#007A6B]">
                  {yesterday.booked}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Booked
                </p>
              </div>
              <div>
                <p className="text-3xl font-black tabular-nums tracking-tighter">
                  {yesterday.closed}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Closed
                </p>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Frequenza · {rangeTotal} eventi
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DAY_OPTIONS.map((d) => (
                  <Chip key={d} href={hrefFor(d, type)} active={days === d}>
                    {d}g
                  </Chip>
                ))}
                <span className="mx-1 w-px self-stretch bg-zinc-200 dark:bg-zinc-800" />
                {TYPE_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    href={hrefFor(days, opt.value)}
                    active={type === opt.value}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>

            <FrequencyChart series={series} type={type} />
          </section>
        </>
      )}
    </main>
  );
}
