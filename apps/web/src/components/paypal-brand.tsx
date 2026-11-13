import { cn } from "@/lib/utils";

// PayPal's own marks, used as PayPal asks: the official files, served by PayPal and never
// redrawn, recoloured or self-hosted (developer.paypal.com/log-in/designer-guide). These are the
// only place boreal.work shows another company's colours; see brand.md, "Other companies' marks".

const MARK = "https://www.paypalobjects.com/paypal-ui/logos/svg/paypal-mark-color.svg";
const LOGO = "https://www.paypalobjects.com/paypal-ui/logos/svg/paypal-color.svg";

/** PayPal's full colour logo, for naming PayPal (the "Powered by" row). */
export function PayPalLogo({ className = "h-4 w-auto" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- PayPal asks that its marks be loaded from PayPal
  return <img src={LOGO} alt="PayPal" className={className} />;
}

/**
 * Log in with PayPal, built to PayPal's button guide: the light grey button (#EEEEEE) with black
 * text and PayPal's colour monogram, pill-shaped, at least 13 pt. A route handler redirects to
 * PayPal, so it is a full navigation (a plain link), never <Link>.
 */
export function PayPalLoginButton({
  next,
  label = "Log in with PayPal",
  className,
}: {
  next?: string;
  label?: string;
  className?: string;
}) {
  const href = next ? `/paypal/login?next=${encodeURIComponent(next)}` : "/paypal/login";
  return (
    <a
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full bg-[#eeeeee] px-6 py-2.5 text-base font-semibold text-black transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- PayPal asks that its marks be loaded from PayPal */}
      <img src={MARK} alt="" className="h-5 w-auto" />
      {label}
    </a>
  );
}
