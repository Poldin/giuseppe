"use client";

import type { AifaPriceHistoryPoint } from "@/app/lib/aifa/types";
import { formatEuroIt } from "@/app/lib/seo/aifa";
import { motion } from "framer-motion";
import { useId, useMemo, useState } from "react";

type ChartPoint = {
  published_on: string;
  label: string;
  pubblico: number;
  riferimento: number;
};

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = [
    "gen",
    "feb",
    "mar",
    "apr",
    "mag",
    "giu",
    "lug",
    "ago",
    "set",
    "ott",
    "nov",
    "dic",
  ];
  return `${months[Number(m[2]) - 1]} '${m[1].slice(2)}`;
}

function buildPoints(
  history: AifaPriceHistoryPoint[],
  current: {
    published_on: string | null;
    prezzo_pubblico: number | null;
    prezzo_riferimento_ssn: number | null;
  }
): ChartPoint[] {
  const byDate = new Map<string, ChartPoint>();

  for (const h of [...history].reverse()) {
    if (h.prezzo_pubblico == null && h.prezzo_riferimento_ssn == null) continue;
    byDate.set(h.published_on, {
      published_on: h.published_on,
      label: shortDate(h.published_on),
      pubblico: h.prezzo_pubblico ?? h.prezzo_riferimento_ssn ?? 0,
      riferimento:
        h.prezzo_riferimento_ssn ?? h.prezzo_pubblico ?? 0,
    });
  }

  if (
    current.published_on &&
    (current.prezzo_pubblico != null || current.prezzo_riferimento_ssn != null)
  ) {
    byDate.set(current.published_on, {
      published_on: current.published_on,
      label: shortDate(current.published_on),
      pubblico:
        current.prezzo_pubblico ?? current.prezzo_riferimento_ssn ?? 0,
      riferimento:
        current.prezzo_riferimento_ssn ?? current.prezzo_pubblico ?? 0,
    });
  }

  return [...byDate.values()].sort((a, b) =>
    a.published_on.localeCompare(b.published_on)
  );
}

export function AifaPriceHistoryChart({
  history,
  currentPubblico,
  currentRiferimento,
  currentPublishedOn,
}: {
  history: AifaPriceHistoryPoint[];
  currentPubblico: number | null;
  currentRiferimento: number | null;
  currentPublishedOn: string | null;
}) {
  const reactId = useId();
  const gradId = `aifa-area-${reactId.replace(/:/g, "")}`;
  const [active, setActive] = useState<number | null>(null);

  const points = useMemo(
    () =>
      buildPoints(history, {
        published_on: currentPublishedOn,
        prezzo_pubblico: currentPubblico,
        prezzo_riferimento_ssn: currentRiferimento,
      }),
    [history, currentPubblico, currentRiferimento, currentPublishedOn]
  );

  if (points.length < 2) return null;

  const W = 360;
  const H = 168;
  const pad = { t: 16, r: 12, b: 28, l: 44 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const values = points.flatMap((p) => [p.pubblico, p.riferimento]);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = Math.max(maxV - minV, 0.5);
  const yMin = Math.max(0, minV - span * 0.15);
  const yMax = maxV + span * 0.15;

  const xAt = (i: number) =>
    pad.l + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (v: number) =>
    pad.t + ((yMax - v) / (yMax - yMin || 1)) * innerH;

  const linePath = (key: "pubblico" | "riferimento") =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p[key]).toFixed(1)}`)
      .join(" ");

  const areaPath = (() => {
    const top = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.pubblico).toFixed(1)}`)
      .join(" ");
    const bottom = [...points]
      .reverse()
      .map(
        (p, i) =>
          `${i === 0 ? "L" : "L"} ${xAt(points.length - 1 - i).toFixed(1)} ${yAt(p.riferimento).toFixed(1)}`
      )
      .join(" ");
    return `${top} ${bottom} Z`;
  })();

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  const xLabelIdx =
    points.length <= 3
      ? points.map((_, i) => i)
      : [0, Math.floor((points.length - 1) / 2), points.length - 1];

  const hover = active != null ? points[active] : points[points.length - 1];
  const hoverDiff = hover.pubblico - hover.riferimento;

  return (
    <section className="mt-8" aria-label="Andamento prezzi nel tempo">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">
            Andamento prezzi
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {points.length} aggiornamenti · dal {points[0].label}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {hover.label}
          </p>
          <p className="text-sm font-black tabular-nums">
            {formatEuroIt(hover.pubblico)}
          </p>
          {hoverDiff > 0.004 ? (
            <p className="text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
              +{formatEuroIt(hoverDiff)} vs rif.
            </p>
          ) : (
            <p className="text-xs text-zinc-500">al riferimento</p>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-sm bg-zinc-50 dark:bg-zinc-900/60">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label="Grafico prezzo pubblico e prezzo di riferimento SSN nel tempo"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#dc2626" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#dc2626" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={yAt(tick)}
                y2={yAt(tick)}
                className="stroke-zinc-200 dark:stroke-zinc-800"
                strokeWidth={1}
              />
              <text
                x={pad.l - 6}
                y={yAt(tick) + 3}
                textAnchor="end"
                className="fill-zinc-400"
                fontSize={9}
              >
                {tick.toLocaleString("it-IT", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 1,
                })}
              </text>
            </g>
          ))}

          <motion.path
            d={areaPath}
            fill={`url(#${gradId})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          />

          <motion.path
            d={linePath("riferimento")}
            fill="none"
            className="stroke-zinc-400 dark:stroke-zinc-500"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />

          <motion.path
            d={linePath("pubblico")}
            fill="none"
            className="stroke-zinc-900 dark:stroke-zinc-100"
            strokeWidth={2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.1 }}
          />

          {points.map((p, i) => (
            <circle
              key={p.published_on}
              cx={xAt(i)}
              cy={yAt(p.pubblico)}
              r={active === i || i === points.length - 1 ? 3.5 : 2}
              className={
                active === i || i === points.length - 1
                  ? "fill-zinc-900 dark:fill-zinc-100"
                  : "fill-zinc-500"
              }
            />
          ))}

          {xLabelIdx.map((i) => (
            <text
              key={`x-${i}`}
              x={xAt(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-zinc-400"
              fontSize={9}
            >
              {points[i].label}
            </text>
          ))}

          {/* hit areas */}
          {points.map((p, i) => (
            <rect
              key={`hit-${p.published_on}`}
              x={xAt(i) - innerW / points.length / 2}
              y={pad.t}
              width={Math.max(innerW / points.length, 12)}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              role="button"
              aria-label={`${p.label}: pubblico ${formatEuroIt(p.pubblico)}, riferimento ${formatEuroIt(p.riferimento)}`}
            />
          ))}

          {active != null ? (
            <line
              x1={xAt(active)}
              x2={xAt(active)}
              y1={pad.t}
              y2={pad.t + innerH}
              className="stroke-zinc-300 dark:stroke-zinc-600"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          ) : null}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-zinc-900 dark:bg-zinc-100" />
          Pubblico
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t border-dashed border-zinc-400" />
          Rif. SSN
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-red-600/25" />
          Differenza
        </span>
      </div>
    </section>
  );
}
