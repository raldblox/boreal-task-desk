import { ExternalLink } from "lucide-react";

/** A link to a transaction on its chain's explorer (server/explorer.ts makes the url). */
export function TxLink({ href, children = "View transaction" }: { href: string | null; children?: React.ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
      {children} <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
