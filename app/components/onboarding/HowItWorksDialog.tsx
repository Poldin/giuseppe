"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EcommerceInfo } from "@/app/lib/search/elabora-scenari-types";

type HowItWorksDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SLIDES = [
  {
    title: "Completa la lista di prodotti che ti servono",
    description:
      "Cerca, scegli dai suggerimenti o aggiungi testo libero: componi la lista di ciò che ti serve in studio.",
  },
  {
    title: "Lasciami comparare prezzi e prodotti",
    description:
      "Confronto automatico sui rivenditori partner e classifica aggiornata in tempo reale.",
  },
  {
    title: "Modifica i prodotti, aggiungine di nuovi e modifica le quantità",
    description:
      "Per ogni referenza scegli l'offerta migliore e indica quante unità ti servono.",
  },
  {
    title: "Goditi il confronto automatizzato",
    description:
      "Ricevi il riepilogo della migliore combinazione e acquista direttamente dai rivenditori.",
  },
] as const;

function formatEuro(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function SlideHomeListDemo({ active }: { active: boolean }) {
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const chips = ["guanti in nitrile", "mascherine chirurgiche", "aspirasaliva"];

  useEffect(() => {
    if (!active) {
      setSelectedChips([]);
      setTyped("");
      return;
    }

    const steps = [
      () => setSelectedChips(["guanti in nitrile"]),
      () => setSelectedChips(["guanti in nitrile", "mascherine chirurgiche"]),
      () => setTyped("composito dentale"),
      () => {
        setSelectedChips([
          "guanti in nitrile",
          "mascherine chirurgiche",
          "composito dentale",
        ]);
        setTyped("");
      },
    ];

    let index = 0;
    const run = () => {
      steps[index]?.();
      index = (index + 1) % (steps.length + 1);
      if (index === 0) {
        setSelectedChips([]);
        setTyped("");
      }
    };

    run();
    const timer = window.setInterval(run, 1400);
    return () => window.clearInterval(timer);
  }, [active]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <Search size={16} className="shrink-0 text-zinc-400" />
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">
          {typed || "Cerca un prodotto..."}
        </span>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950">
          <Plus size={14} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          potrebbe servirti
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {chips.map((chip) => {
            const selected = selectedChips.includes(chip);
            return (
              <span
                key={chip}
                className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selected
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                    : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                }`}
              >
                {chip}
              </span>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          La tua ricerca ({selectedChips.length})
        </p>
        <ul className="flex min-h-24 flex-col gap-2">
          <AnimatePresence initial={false}>
            {selectedChips.map((item) => (
              <motion.li
                key={item}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                {item}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <div className="rounded-full bg-zinc-900 px-4 py-2.5 text-center text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950">
        Cerca e confronta prezzi
      </div>
    </div>
  );
}

type RankingItem = {
  id: string;
  name: string;
  logo_url: string | null;
  total: number;
  coverage: string;
};

function buildRankingSets(ecommerces: EcommerceInfo[]): RankingItem[][] {
  const suppliers = ecommerces.slice(0, 3);
  if (suppliers.length === 0) {
    return [];
  }

  const base = suppliers.map((ecommerce, index) => ({
    id: ecommerce.id,
    name: ecommerce.name,
    logo_url: ecommerce.logo_url,
    totals: [
      360 + index * 28,
      372 + index * 22,
      348 + index * 31,
    ] as const,
    coverages: ["4/5", "5/5", "3/5", "5/5", "4/5"] as const,
  }));

  const orders = [
    [0, 1, 2],
    [1, 0, 2],
    [2, 1, 0],
  ].filter((order) => order.every((slot) => slot < base.length));

  return orders.map((order, setIndex) =>
    order.map((slot, rank) => ({
      id: base[slot].id,
      name: base[slot].name,
      logo_url: base[slot].logo_url,
      total: base[slot].totals[setIndex] ?? base[slot].totals[0],
      coverage: base[slot].coverages[(setIndex + rank) % base[slot].coverages.length],
    }))
  );
}

const medalEmoji = ["🥇", "🥈", "🥉"] as const;

function SlideRankingDemo({
  active,
  ecommerces,
}: {
  active: boolean;
  ecommerces: EcommerceInfo[];
}) {
  const rankingSets = useMemo(
    () => buildRankingSets(ecommerces),
    [ecommerces]
  );
  const [setIndex, setSetIndex] = useState(0);
  const items = rankingSets[setIndex] ?? rankingSets[0] ?? [];

  useEffect(() => {
    if (!active || rankingSets.length === 0) {
      setSetIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setSetIndex((current) => (current + 1) % rankingSets.length);
    }, 2200);

    return () => window.clearInterval(timer);
  }, [active, rankingSets.length]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Caricamento rivenditori...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mb-3 px-1">
        <p className="text-sm font-bold">Classifica fornitori</p>
        <p className="text-[11px] text-zinc-500">scopri chi offre di più.</p>
      </div>
      <ul className="flex flex-col gap-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((item, index) => (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0.6, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <div className="flex items-center gap-2">
                <span aria-hidden="true">{medalEmoji[index] ?? "🏅"}</span>
                <div className="inline-flex h-5 min-w-0 max-w-full items-center rounded-md bg-white px-2 py-0.5 ring-1 ring-zinc-100 dark:ring-zinc-800">
                  {item.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.logo_url}
                      alt={item.name}
                      className="h-full w-auto max-w-full object-contain object-left"
                    />
                  ) : (
                    <span className="text-[10px] font-bold uppercase text-zinc-600 dark:text-zinc-400">
                      {item.name.slice(0, 2)}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Copertura
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {item.coverage}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Totale
                  </p>
                  <p className="text-sm font-bold tabular-nums">
                    {formatEuro(item.total)}
                  </p>
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

type DemoProduct = {
  id: string;
  name: string;
  price: number;
};

type DemoEcommerceGroup = {
  ecommerce: EcommerceInfo;
  products: DemoProduct[];
};

const DEMO_PRODUCT_SETS: DemoProduct[][] = [
  [
    {
      id: "p1",
      name: "Guanti nitrile non talcato taglia M - 100 pz",
      price: 8.9,
    },
    {
      id: "p2",
      name: "Guanti nitrile blu taglia L - confezione 100",
      price: 9.4,
    },
  ],
  [
    {
      id: "p1",
      name: "Nitrile powder free taglia M - box 100",
      price: 7.4,
    },
    {
      id: "p2",
      name: "Guanti nitrile nero taglia M - 100 pezzi",
      price: 8.1,
    },
  ],
];

function buildMatchGroups(ecommerces: EcommerceInfo[]): DemoEcommerceGroup[] {
  return ecommerces.slice(0, 2).map((ecommerce, index) => ({
    ecommerce,
    products: DEMO_PRODUCT_SETS[index] ?? DEMO_PRODUCT_SETS[0],
  }));
}

function buildCardKey(ecommerceId: string, productId: string) {
  return `${ecommerceId}-${productId}`;
}

function DemoMatchCard({
  product,
  selected,
  quantity,
  hasSelection,
}: {
  product: DemoProduct;
  selected: boolean;
  quantity: number;
  hasSelection: boolean;
}) {
  return (
    <motion.div
      animate={{
        opacity: !hasSelection || selected ? 1 : 0.72,
        scale: selected ? 1 : 0.98,
      }}
      className={`relative w-44 shrink-0 rounded-xl p-3 sm:w-48 ${
        selected
          ? "border-[3px] border-zinc-900 bg-white shadow-md dark:border-zinc-100 dark:bg-zinc-950"
          : "border border-zinc-200/60 bg-white/70 dark:border-zinc-700/50 dark:bg-zinc-950/40"
      }`}
    >
      <div className="absolute right-2 top-2">
        <div
          className={`rounded-md p-1 ${
            selected
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-400"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </div>
      </div>

      <p className="min-h-10 pr-6 text-[11px] leading-snug">{product.name}</p>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
          <span className="rounded-l-lg p-1 text-zinc-500">
            <Minus className="h-3 w-3" />
          </span>
          <span className="w-7 text-center text-xs font-semibold tabular-nums">
            {selected ? quantity : 1}
          </span>
          <span className="rounded-r-lg p-1 text-zinc-500">
            <Plus className="h-3 w-3" />
          </span>
        </div>
        <span className="text-sm font-bold tabular-nums">
          {formatEuro(product.price * (selected ? quantity : 1))}
        </span>
      </div>
    </motion.div>
  );
}

function buildSelectionSequence(
  groups: DemoEcommerceGroup[]
): Array<() => Record<string, { productId: string; quantity: number }>> {
  if (groups.length === 0) {
    return [];
  }

  if (groups.length === 1) {
    const group = groups[0];
    const ecommerceId = group.ecommerce.id;
    const topProductId = group.products[0].id;

    return [
      () => ({
        [ecommerceId]: { productId: topProductId, quantity: 1 },
      }),
      () => ({
        [ecommerceId]: { productId: topProductId, quantity: 2 },
      }),
      () => ({
        [ecommerceId]: { productId: topProductId, quantity: 3 },
      }),
      () => ({
        [ecommerceId]: { productId: topProductId, quantity: 1 },
      }),
    ];
  }

  const [firstGroup, secondGroup] = groups;
  const firstId = firstGroup.ecommerce.id;
  const secondId = secondGroup.ecommerce.id;
  const firstTopId = firstGroup.products[0].id;
  const secondTopId = secondGroup.products[0].id;
  const secondAltId = secondGroup.products[1]?.id ?? secondTopId;

  return [
    () => ({
      [firstId]: { productId: firstTopId, quantity: 1 },
      [secondId]: { productId: secondTopId, quantity: 1 },
    }),
    () => ({
      [firstId]: { productId: firstTopId, quantity: 2 },
      [secondId]: { productId: secondTopId, quantity: 1 },
    }),
    () => ({
      [firstId]: { productId: firstTopId, quantity: 3 },
      [secondId]: { productId: secondTopId, quantity: 1 },
    }),
    () => ({
      [firstId]: { productId: firstTopId, quantity: 3 },
      [secondId]: { productId: secondAltId, quantity: 1 },
    }),
    () => ({
      [firstId]: { productId: firstTopId, quantity: 1 },
      [secondId]: { productId: secondTopId, quantity: 1 },
    }),
  ];
}

function SlideMatchStripDemo({
  active,
  ecommerces,
}: {
  active: boolean;
  ecommerces: EcommerceInfo[];
}) {
  const groups = useMemo(() => buildMatchGroups(ecommerces), [ecommerces]);
  const [selections, setSelections] = useState<
    Record<string, { productId: string; quantity: number }>
  >({});

  const totalMatches = groups.reduce(
    (sum, group) => sum + group.products.length,
    0
  );

  useEffect(() => {
    if (!active || groups.length === 0) {
      setSelections({});
      return;
    }

    const sequence = buildSelectionSequence(groups);
    if (sequence.length === 0) {
      return;
    }

    let index = 0;
    const run = () => {
      setSelections(sequence[index]());
      index = (index + 1) % sequence.length;
    };

    run();
    const timer = window.setInterval(run, 1500);
    return () => window.clearInterval(timer);
  }, [active, groups]);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Caricamento rivenditori...
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-zinc-200/80 bg-zinc-200 p-4 dark:border-zinc-900 dark:bg-zinc-900/50 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          guanti in nitrile
        </h3>
        <span className="whitespace-nowrap text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">
          totale: {totalMatches}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.ecommerce.id} className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <div className="inline-flex h-5 max-w-full items-center rounded-md bg-white px-2 py-0.5 ring-1 ring-zinc-100 dark:ring-zinc-800">
                {group.ecommerce.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={group.ecommerce.logo_url}
                    alt={group.ecommerce.name}
                    className="h-full w-auto max-w-28 object-contain object-left"
                  />
                ) : (
                  <span className="text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">
                    {group.ecommerce.name.slice(0, 2)}
                  </span>
                )}
              </div>
              <span className="whitespace-nowrap text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">
                totale: {group.products.length}
              </span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {group.products.map((product) => {
                const groupSelection = selections[group.ecommerce.id];
                const selected = groupSelection?.productId === product.id;
                const quantity = groupSelection?.quantity ?? 1;

                return (
                  <DemoMatchCard
                    key={buildCardKey(group.ecommerce.id, product.id)}
                    product={product}
                    selected={selected}
                    quantity={quantity}
                    hasSelection={groupSelection != null}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function formatScenarioSummary(
  copertura: number,
  coperturaTotale: number,
  prezzoProdotti: number,
  prezzoSpedizione: number
) {
  const spedizioneLabel =
    prezzoSpedizione > 0
      ? ` · spedizione ${formatEuro(prezzoSpedizione)}`
      : " · spedizione 0 €";

  return `${copertura}/${coperturaTotale} referenze · prodotti ${formatEuro(prezzoProdotti)}${spedizioneLabel}`;
}

type DemoScenarioLine = {
  productName: string;
  brand?: string;
  unitPrice: number;
  quantity: number;
  ecommerceIndex: number;
};

const DEMO_SCENARIO_LINES: DemoScenarioLine[] = [
  {
    productName: "Guanti nitrile non talcato taglia M - 100 pz",
    brand: "SafeTouch",
    unitPrice: 7.4,
    quantity: 2,
    ecommerceIndex: 0,
  },
  {
    productName: "Mascherine chirurgiche 3 veli - 50 pz",
    brand: "MedPro",
    unitPrice: 12.9,
    quantity: 1,
    ecommerceIndex: 0,
  },
  {
    productName: "Composito dentale universale syringa 4g",
    brand: "DentFill",
    unitPrice: 48.5,
    quantity: 1,
    ecommerceIndex: 1,
  },
];

function buildDemoScenarioOrders(ecommerces: EcommerceInfo[]) {
  const map = new Map<
    string,
    {
      ecommerce: EcommerceInfo;
      lines: Array<DemoScenarioLine & { rowPrice: number }>;
      productsTotal: number;
      shipping: number;
    }
  >();

  for (const line of DEMO_SCENARIO_LINES) {
    const ecommerce = ecommerces[line.ecommerceIndex];
    if (!ecommerce) continue;

    const rowPrice = line.unitPrice * line.quantity;
    const current = map.get(ecommerce.id) ?? {
      ecommerce,
      lines: [],
      productsTotal: 0,
      shipping: 0,
    };

    current.lines.push({ ...line, rowPrice });
    current.productsTotal += rowPrice;
    map.set(ecommerce.id, current);
  }

  return [...map.values()].map((order) => ({
    ...order,
    shipping: order.productsTotal >= 50 ? 0 : 6.9,
    partialTotal: order.productsTotal + (order.productsTotal >= 50 ? 0 : 6.9),
  }));
}

function SlideBestOfferDemo({
  active,
  ecommerces,
}: {
  active: boolean;
  ecommerces: EcommerceInfo[];
}) {
  const orders = useMemo(
    () => buildDemoScenarioOrders(ecommerces),
    [ecommerces]
  );

  const prezzoProdotti = DEMO_SCENARIO_LINES.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0
  );
  const prezzoSpedizione = orders.reduce((sum, order) => sum + order.shipping, 0);
  const prezzoTotale = prezzoProdotti + prezzoSpedizione;
  const copertura = DEMO_SCENARIO_LINES.length;
  const coperturaTotale = DEMO_SCENARIO_LINES.length;

  const [highlightTotal, setHighlightTotal] = useState(false);

  useEffect(() => {
    if (!active) {
      setHighlightTotal(false);
      return;
    }

    setHighlightTotal(true);
    const timer = window.setInterval(() => {
      setHighlightTotal((current) => !current);
    }, 1800);

    return () => window.clearInterval(timer);
  }, [active]);

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Caricamento migliore offerta...
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <header className="flex flex-wrap items-start justify-between gap-3 bg-zinc-900 px-4 py-3 sm:px-5 sm:py-4 dark:bg-zinc-950">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-white">💸Miglior soluzione</h3>
          <p className="mt-1 text-xs text-zinc-400">
            {formatScenarioSummary(
              copertura,
              coperturaTotale,
              prezzoProdotti,
              prezzoSpedizione
            )}
          </p>
        </div>
        <motion.p
          animate={{ scale: highlightTotal ? 1.04 : 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          className="shrink-0 text-2xl font-bold tabular-nums tracking-tight text-white"
        >
          {formatEuro(prezzoTotale)}
        </motion.p>
      </header>

      <div className="p-4 sm:p-5">
        {orders.map((order) => (
          <div key={order.ecommerce.id} className="mb-4 last:mb-0">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="inline-flex h-6 max-w-full items-center rounded-md bg-white px-2 py-0.5 ring-1 ring-zinc-100 dark:ring-zinc-800">
                {order.ecommerce.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={order.ecommerce.logo_url}
                    alt={order.ecommerce.name}
                    className="h-full w-auto max-w-28 object-contain object-left"
                  />
                ) : (
                  <span className="text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">
                    {order.ecommerce.name.slice(0, 2)}
                  </span>
                )}
              </div>
              <p className="shrink-0 text-lg font-bold tabular-nums tracking-tight">
                {formatEuro(order.partialTotal)}
              </p>
            </div>
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              {formatScenarioSummary(
                order.lines.length,
                coperturaTotale,
                order.productsTotal,
                order.shipping
              )}
            </p>

            <ul className="space-y-2">
              {order.lines.map((line) => (
                <li
                  key={line.productName}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 sm:items-center sm:gap-x-4"
                >
                  <div className="min-w-0 space-y-1.5">
                    <span className="inline-block w-fit max-w-full rounded-md bg-white px-2 py-1 text-xs font-bold leading-snug break-words text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                      {line.productName}
                    </span>
                    {line.brand ? (
                      <span className="inline-flex shrink-0 items-center px-2 py-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {line.brand}
                      </span>
                    ) : null}
                  </div>
                  <div className="shrink-0 self-center text-right text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                    {line.quantity > 1 ? (
                      <span className="whitespace-nowrap">
                        × {formatEuro(line.unitPrice)} ={" "}
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {formatEuro(line.rowPrice)}
                        </span>
                      </span>
                    ) : (
                      formatEuro(line.rowPrice)
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

const SLIDE_DEMOS = [SlideHomeListDemo] as const;

export function HowItWorksDialog({
  open,
  onOpenChange,
}: HowItWorksDialogProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [ecommerces, setEcommerces] = useState<EcommerceInfo[]>([]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      const timer = window.setTimeout(() => setSlideIndex(0), 220);
      return () => window.clearTimeout(timer);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, handleClose]);

  useEffect(() => {
    if (!open || ecommerces.length > 0) {
      return;
    }

    void fetch("/api/ecommerce")
      .then((res) => res.json())
      .then((payload: { ecommerces?: EcommerceInfo[] }) => {
        if (Array.isArray(payload.ecommerces)) {
          setEcommerces(payload.ecommerces);
        }
      })
      .catch(() => {
        /* demo opzionale */
      });
  }, [open, ecommerces.length]);

  const slide = SLIDES[slideIndex];
  const SlideDemo = slideIndex === 0 ? SLIDE_DEMOS[0] : null;
  const isLastSlide = slideIndex === SLIDES.length - 1;

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative flex h-full min-h-0 flex-col"
          >
            <button
              type="button"
              onClick={handleClose}
              aria-label="Chiudi"
              className="absolute right-4 top-4 z-10 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 sm:right-6 sm:top-6"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mx-auto flex w-full max-w-lg min-h-0 flex-1 flex-col px-4 pb-6 pt-14 sm:px-6 sm:pb-8 sm:pt-16">
              <div className="mb-4 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setSlideIndex((current) => Math.max(0, current - 1))
                    }
                    disabled={slideIndex === 0}
                    aria-label="Slide precedente"
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Indietro
                  </button>

                  <div className="flex items-center justify-center gap-2">
                    {SLIDES.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setSlideIndex(index)}
                        aria-label={`Vai alla slide ${index + 1}`}
                        className={`h-2 rounded-full transition-all ${
                          index === slideIndex
                            ? "w-6 bg-zinc-900 dark:bg-zinc-100"
                            : "w-2 bg-zinc-300 dark:bg-zinc-700"
                        }`}
                      />
                    ))}
                  </div>

                  {isLastSlide ? (
                    <button
                      type="button"
                      onClick={handleClose}
                      className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      Ho capito
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setSlideIndex((current) =>
                          Math.min(SLIDES.length - 1, current + 1)
                        )
                      }
                      aria-label="Slide successiva"
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Avanti
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <h2 className="mt-4 text-2xl font-black uppercase tracking-tighter sm:text-3xl">
                  {slide.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-base">
                  {slide.description}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={slideIndex}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.22 }}
                  >
                    {slideIndex === 1 ? (
                      <SlideRankingDemo
                        active={open}
                        ecommerces={ecommerces}
                      />
                    ) : slideIndex === 2 ? (
                      <SlideMatchStripDemo
                        active={open}
                        ecommerces={ecommerces}
                      />
                    ) : slideIndex === 3 ? (
                      <SlideBestOfferDemo
                        active={open}
                        ecommerces={ecommerces}
                      />
                    ) : SlideDemo ? (
                      <SlideDemo active={open} />
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
