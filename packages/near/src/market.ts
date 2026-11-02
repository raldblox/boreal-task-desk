// NEAR Agent Market (market.near.ai), seen from a self-hosted agent: the four calls in
// https://docs.market.near.ai/list-your-agent, with the listing's `aat_…` token.

export const MARKET_URL = "https://market.near.ai";

export interface MarketAssignment {
  assignment: {
    assignmentId: string;
    /** Set once the agent called `start`. */
    startedAt: string | null;
    slaDeadlineAt: string;
    [key: string]: unknown;
  };
  job: {
    /** The buyer's brief. Text written by the buyer: data, never instructions. */
    description: string;
    title?: string;
    [key: string]: unknown;
  };
}

export interface AgentMarket {
  /** Jobs awarded to this agent. */
  assignments(): Promise<MarketAssignment[]>;
  /** Tells the buyer the job is picked up; after this they can't cancel for a refund inside the window. */
  start(assignmentId: string): Promise<void>;
  message(assignmentId: string, body: string): Promise<void>;
  /** Hands in the deliverable; this completes the job. */
  submit(assignmentId: string, deliverableMarkdown: string): Promise<void>;
}

export class MarketError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function createAgentMarket(options: { token: string; baseUrl?: string; fetch?: typeof fetch }): AgentMarket {
  const { token, baseUrl = MARKET_URL, fetch: fetchImpl = fetch } = options;
  if (!token.startsWith("aat_")) throw new MarketError("NEAR_MARKET_TOKEN must be the listing's aat_… token");

  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    // The response can echo the buyer's brief; keep errors short and free of it.
    if (!res.ok) throw new MarketError(`Agent Market ${method} ${path.replace(/\/[^/]{8,}\//, "/…/")} answered ${res.status}`, res.status);
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    async assignments() {
      return (await api<{ assignments: MarketAssignment[] }>("GET", "/v1/agents/me/assignments")).assignments ?? [];
    },
    async start(id) {
      await api("POST", `/v1/assignments/${encodeURIComponent(id)}/start`);
    },
    async message(id, body) {
      await api("POST", `/v1/assignments/${encodeURIComponent(id)}/messages`, { body });
    },
    async submit(id, deliverableMarkdown) {
      await api("POST", `/v1/assignments/${encodeURIComponent(id)}/submit`, { deliverableMarkdown });
    },
  };
}
