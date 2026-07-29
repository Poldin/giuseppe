/** Bot ufficiali / crawler: niente lavoro costoso (trgm, axe, live refresh). */
export function isCrawlerUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /bot|crawler|spider|slurp|facebookexternalhit|embedly|quora link preview|bingpreview|linkedinbot|skypeuripreview|applebot|semrush|ahrefs|mj12bot|dotbot|gptbot|claudebot|google-extended|bytespider|amazonbot|petalbot|duckduckbot|yandex/i.test(
    userAgent
  );
}
