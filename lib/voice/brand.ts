// Customers see RANA's engines as "R1" and "R2" — never the providers behind them.
// Run any message that may reach a customer (API errors, provider error text) through hideVendors().

export const ENGINE_PUBLIC_NAME = { sarvam: "R1", cartesia: "R2" } as const;

export function hideVendors<T>(msg: T): T {
  if (typeof msg !== "string" || !msg) return msg;
  return msg
    .replace(/https?:\/\/\S*(sarvam|cartesia)\S*/gi, "")
    .replace(/\b[\w.-]*(sarvam|cartesia)\.(ai|com)\b(\s*→\s*\w+(?: \w+)?)?/gi, "the provider dashboard")
    .replace(/\b(RANA_)?SARVAM_[A-Z_]+\b|\bCARTESIA_API_KEY\b/g, "the engine key")
    .replace(/\bSarvam(\s+AI)?\b/gi, "R1")
    .replace(/\bCartesia\b/gi, "R2") as unknown as T;
}
