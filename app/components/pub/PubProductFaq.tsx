"use client";

import type { FaqItem } from "@/app/lib/seo/site";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function PubProductFaq({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState(0);

  if (items.length === 0) return null;

  return (
    <section
      id="faq"
      aria-labelledby="pub-faq-heading"
      className="mt-14 border-t border-zinc-100 pt-8 dark:border-zinc-900"
    >
      <h2
        id="pub-faq-heading"
        className="mb-4 text-lg font-black uppercase tracking-tighter"
      >
        Domande frequenti
      </h2>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {items.map((item, index) => {
          const isOpen = openIndex === index;
          const panelId = `pub-faq-panel-${index}`;
          const buttonId = `pub-faq-button-${index}`;

          return (
            <div key={item.question} className="py-1">
              <h3>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm font-bold leading-snug transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <span>{item.question}</span>
                  <ChevronDown
                    aria-hidden
                    className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </h3>
              {/* Risposta sempre nel DOM per crawler/AI; nascosta solo in UI se chiusa */}
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                hidden={!isOpen}
                className="pb-3.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400"
              >
                {item.answer}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
