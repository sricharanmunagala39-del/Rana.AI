// Server-only half of the provider layer: which engines are actually configured on this deployment.
import { sarvamConfig } from "@/lib/sarvamAgent";
import { ENGINES, clientEngines, type EngineId } from "./engines";

export function engineReady(id: EngineId): boolean {
  if (id === "sarvam") return !!sarvamConfig();
  if (id === "cartesia") return !!process.env.CARTESIA_API_KEY;
  return false;
}

/** What this client may choose from, with each engine's capabilities and readiness. */
export function enginesFor(client: any) {
  const allowed = clientEngines(client);
  return (Object.keys(ENGINES) as EngineId[]).map((id) => ({
    ...ENGINES[id],
    allowed: allowed.includes(id),
    ready: engineReady(id),
  }));
}
