"use client";

import { HowItWorksDialog } from "@/app/components/onboarding/HowItWorksDialog";
import { useState } from "react";

const buttonClassName =
  "w-fit rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-transparent dark:bg-zinc-900 dark:font-semibold dark:text-white dark:hover:bg-zinc-800";

export function HowItWorksButton({
  className = buttonClassName,
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ? `${buttonClassName} ${className}` : buttonClassName}
      >
        Come funziona?
      </button>
      <HowItWorksDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
