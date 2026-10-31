// A small PayPal REST client: OAuth client-credentials tokens, JSON in and out, and
// `PayPal-Request-Id` on every write, so a retried call returns the first call's result.

export const PAYPAL_SANDBOX_URL = "https://api-m.sandbox.paypal.com";

export interface PayPalClientOptions {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

export class PayPalError extends Error {
  constructor(
    readonly status: number,
    /** PayPal's error name, like UNPROCESSABLE_ENTITY. */
    readonly errorName: string,
    /** Issue codes from `details`, like ORDER_NOT_APPROVED. */
    readonly issues: string[],
    message: string,
    readonly debugId?: string,
  ) {
    super(message);
    this.name = "PayPalError";
  }

  has(pattern: RegExp): boolean {
    return pattern.test(this.errorName) || this.issues.some((issue) => pattern.test(issue)) || pattern.test(this.message);
  }
}

export interface PayPalClient {
  request<T>(method: "GET" | "POST", path: string, options?: { body?: unknown; requestId?: string }): Promise<T>;
}

export function createPayPalClient(options: PayPalClientOptions): PayPalClient {
  const baseUrl = options.baseUrl ?? PAYPAL_SANDBOX_URL;
  const http = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  let token: { value: string; until: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.until > now().getTime()) return token.value;
    const basic = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64");
    const res = await http(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw await errorFrom(res);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    // Renew a minute early so a token never expires mid-request.
    token = { value: body.access_token, until: now().getTime() + (body.expires_in - 60) * 1000 };
    return token.value;
  }

  return {
    async request(method, path, { body, requestId } = {}) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      };
      if (requestId) headers["PayPal-Request-Id"] = requestId;
      const res = await http(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? (method === "POST" ? "{}" : undefined) : JSON.stringify(body),
      });
      if (!res.ok) throw await errorFrom(res);
      const text = await res.text();
      return (text ? JSON.parse(text) : {}) as never;
    },
  };
}

async function errorFrom(res: Response): Promise<PayPalError> {
  let body: { name?: string; message?: string; error?: string; error_description?: string; debug_id?: string; details?: { issue?: string; description?: string }[] } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Not JSON; the status says enough.
  }
  const issues = (body.details ?? []).map((d) => d.issue ?? "").filter(Boolean);
  const name = body.name ?? body.error ?? `HTTP_${res.status}`;
  const detail = body.details?.[0]?.description ?? body.message ?? body.error_description ?? res.statusText;
  return new PayPalError(res.status, name, issues, `PayPal ${name}${issues.length ? ` (${issues.join(", ")})` : ""}: ${detail}`, body.debug_id);
}

/** Minor units to PayPal's decimal string: 1234 -> "12.34". */
export function toValue(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`amount must be whole minor units, got ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** PayPal's decimal string to minor units, without floating point: "12.3" -> 1230. */
export function fromValue(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`unexpected PayPal amount ${value}`);
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
