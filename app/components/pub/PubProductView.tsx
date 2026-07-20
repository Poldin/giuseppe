import { PubProductActions } from "@/app/components/pub/PubProductActions";
import { PubProductFaq } from "@/app/components/pub/PubProductFaq";
import { PubRelatedProducts } from "@/app/components/pub/PubRelatedProducts";
import type { PubProduct } from "@/app/lib/pub/product";
import { formatPubPrice } from "@/app/lib/pub/product";
import { getPubProductFaqItems } from "@/app/lib/seo/pub-product";
import Link from "next/link";

function ecommerceHref(domain: string | null): string | null {
  if (!domain?.trim()) return null;
  const trimmed = domain.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/\//, "")}`;
}

export function PubProductView({ product }: { product: PubProduct }) {
  const priceLabel = formatPubPrice(product.final_price);
  const shop = product.ecommerce;
  const shopHref = shop ? ecommerceHref(shop.domain) : null;
  const productUrl = product.original_url?.trim() || null;
  const faqItems = getPubProductFaqItems(product);

  const ecommerceBadgeClassName =
    "inline-flex h-7 w-fit max-w-full items-center rounded-md bg-white px-2.5 py-1 ring-1 ring-zinc-100 dark:ring-zinc-800";

  const ecommerceBadgeContent = shop?.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={shop.logo_url}
      alt={shop.name}
      className="h-full w-auto max-w-32 object-contain object-left"
    />
  ) : shop ? (
    <span className="text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">
      {shop.name.slice(0, 2)}
    </span>
  ) : null;

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
            <li className="truncate text-zinc-500">{product.product_name}</li>
          </ol>
        </nav>

        <header className="flex flex-col gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
              {product.product_name}
            </h1>
            {product.brand ? (
              <p className="mt-1.5 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {product.brand}
              </p>
            ) : null}
          </div>

          {shop && ecommerceBadgeContent ? (
            shopHref ? (
              <a
                href={shopHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Visita ${shop.name}`}
                className={ecommerceBadgeClassName}
              >
                {ecommerceBadgeContent}
              </a>
            ) : (
              <div className={ecommerceBadgeClassName}>{ecommerceBadgeContent}</div>
            )
          ) : null}
        </header>

        <section className="mt-10 flex flex-col gap-2" aria-label="Prezzo">
          {product.is_escluded ? (
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Questo prodotto potrebbe essere escluso dalla vendita, verifica sul
              sito del rivenditore
            </p>
          ) : priceLabel ? (
            <>
              <p className="text-4xl font-black tracking-tighter tabular-nums">
                {priceLabel}
              </p>
              {product.discount != null ? (
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Sconto indicato: {product.discount.toLocaleString("it-IT")}%
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-lg text-zinc-500">Prezzo non disponibile</p>
          )}
        </section>

        {product.description ? (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-500">
              Descrizione
            </h2>
            <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
              {product.description}
            </p>
          </section>
        ) : null}

        <PubProductActions
          productName={product.product_name}
          productUrl={productUrl}
          ecommerceName={shop?.name ?? null}
        />

        <PubRelatedProducts
          fromProductId={product.id}
          fromPubSlug={product.pub_slug}
        />

        <PubProductFaq items={faqItems} />
      </main>
    </div>
  );
}
