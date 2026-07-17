"use client";

import type { FaqItem } from "@/app/lib/seo/site";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function HomeFaq({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState(0);

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
      <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {items.map((item, index) => {
          const isOpen = openIndex === index;
          const panelId = `faq-panel-${index}`;
          const buttonId = `faq-button-${index}`;

          return (
            <div key={item.question} className="py-1">
              <h3>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                  className="flex w-full items-center justify-between gap-3 py-4 text-left font-bold leading-snug transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <span>{item.question}</span>
                  <ChevronDown
                    aria-hidden
                    className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-200 ${
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
                className="pb-4 leading-relaxed text-zinc-600 dark:text-zinc-400"
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
