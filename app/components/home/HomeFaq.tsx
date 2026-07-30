import type { FaqItem } from "@/app/lib/seo/site";

/** FAQ sempre nel flusso del documento (niente accordion/`hidden`). */
export function HomeFaq({ items }: { items: FaqItem[] }) {
  if (items.length === 0) return null;

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mt-16 scroll-mt-6 border-t border-zinc-100 pt-16 dark:border-zinc-900"
    >
      <h2
        id="faq-heading"
        className="mb-10 text-3xl font-black uppercase tracking-tighter sm:text-4xl"
      >
        FAQ
      </h2>
      <dl className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {items.map((item) => (
          <div key={item.question} className="py-5">
            <dt className="font-bold leading-snug">{item.question}</dt>
            <dd className="mt-2 leading-relaxed text-zinc-600 dark:text-zinc-400">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
