import type { EcommerceInfo } from "@/app/lib/search/elabora-scenari-types";

function ecommerceHref(domain: string | null): string | null {
  if (!domain?.trim()) return null;

  const trimmed = domain.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed.replace(/^\/\//, "")}`;
}

function EcommerceBadge({ ecommerce }: { ecommerce: EcommerceInfo }) {
  const href = ecommerceHref(ecommerce.domain);
  const className =
    "inline-flex h-7 max-w-full items-center rounded-md bg-white px-2.5 py-1 ring-1 ring-zinc-100 dark:ring-zinc-800";

  const content = ecommerce.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ecommerce.logo_url}
      alt={ecommerce.name}
      className="h-full w-auto max-w-32 object-contain object-left"
    />
  ) : (
    <span className="text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">
      {ecommerce.name.slice(0, 2)}
    </span>
  );

  if (!href) {
    return <div className={className}>{content}</div>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Visita ${ecommerce.name}`}
      className={className}
    >
      {content}
    </a>
  );
}

export function HomeEcommerceBadges({
  ecommerces,
}: {
  ecommerces: EcommerceInfo[];
}) {
  if (ecommerces.length === 0) {
    return null;
  }

  return (
    <section className="mt-12">
      <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Confronto prezzi sui principali rivenditori odontoiatrici.
      </p>
      <div className="flex flex-wrap gap-2">
        {ecommerces.map((ecommerce) => (
          <EcommerceBadge key={ecommerce.id} ecommerce={ecommerce} />
        ))}
      </div>
    </section>
  );
}
