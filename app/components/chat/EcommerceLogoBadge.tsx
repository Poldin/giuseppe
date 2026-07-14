export function EcommerceLogoBadge({
  logoUrl,
  name,
  fallback = "initials",
}: {
  logoUrl: string | null | undefined;
  name: string;
  fallback?: "initials" | "full";
}) {
  return (
    <div className="inline-flex h-5 max-w-full items-center rounded-md bg-white px-2 py-0.5 ring-1 ring-zinc-100 dark:ring-zinc-800">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name}
          className="h-full w-auto max-w-28 object-contain object-left"
        />
      ) : (
        <span className="text-xs font-bold uppercase text-zinc-600">
          {fallback === "full" ? name : name.slice(0, 2)}
        </span>
      )}
    </div>
  );
}
