import { PubInlineComparison } from "@/app/components/pub/PubInlineComparison";
import { PubProductFaq } from "@/app/components/pub/PubProductFaq";
import type { TypeLander } from "@/app/lib/category/type-lander";
import { formatPubPrice } from "@/app/lib/pub/product";
import { pubProductPath } from "@/app/lib/seo/pub-product";
import {
  getTypeLanderFaqItems,
  typeLanderDisplayTitle,
  typeLanderHubPath,
} from "@/app/lib/seo/type-lander";
import Link from "next/link";

export function TypeLanderView({ lander }: { lander: TypeLander }) {
  const h1 = typeLanderDisplayTitle(lander);
  const minLabel = formatPubPrice(lander.min_price);
  const maxLabel = formatPubPrice(lander.max_price);
  const faqItems = getTypeLanderFaqItems(lander);
  const compareQuery = lander.seo_title;

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto max-w-lg px-4 py-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
            <li>
              <Link
                href="/"
                className="font-medium text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Giuseppe
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={typeLanderHubPath()}
                className="font-medium text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Categorie
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="truncate text-zinc-500">{lander.seo_title}</li>
          </ol>
        </nav>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
            {h1}
          </h1>
          {minLabel && maxLabel && minLabel !== maxLabel ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Indicativamente da{" "}
              <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                {minLabel}
              </span>{" "}
              a{" "}
              <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                {maxLabel}
              </span>
            </p>
          ) : null}
        </header>

        <section className="mt-10" aria-labelledby="type-lander-samples-heading">
          <h2
            id="type-lander-samples-heading"
            className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500"
          >
            Esempi di prezzo
          </h2>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {lander.sample_products.map((product) => {
              const priceLabel = formatPubPrice(product.final_price);
              return (
                <li key={product.id}>
                  <Link
                    href={pubProductPath(product.pub_slug)}
                    className="flex items-start justify-between gap-3 py-3.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug">
                        {product.product_name}
                      </span>
                      {product.brand ? (
                        <span className="mt-0.5 block text-xs uppercase tracking-wide text-zinc-500">
                          {product.brand}
                        </span>
                      ) : null}
                    </span>
                    {priceLabel ? (
                      <span className="shrink-0 text-sm font-black tabular-nums tracking-tight">
                        {priceLabel}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <PubInlineComparison productName={compareQuery} />

        <PubProductFaq items={faqItems} />
      </main>
    </div>
  );
}
