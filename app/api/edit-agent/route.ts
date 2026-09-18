export const runtime = "nodejs";

export async function POST(req: Request) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "SARVAM_API_KEY is not set on the server yet." }, { status: 500 });
  }

  try {
    const { greeting, instructions, facts, request: userRequest } = await req.json();

    const systemPrompt = `You edit configuration for an AI phone agent. You will be given the agent's current Greeting, Instructions, and Facts list, plus a change request from the person who runs the agent. Rewrite whatever needs to change to satisfy the request, and leave the rest as close to the original as reasonably possible.

Return ONLY a raw JSON object with exactly these keys, no markdown fences, no extra text:
{
  "greeting": "string",
  "instructions": "string",
  "facts": ["string", "string", ...],
  "summary": "one short sentence describing what you changed"
}`;

    const userPrompt = `Current Greeting:\n${greeting}\n\nCurrent Instructions:\n${instructions}\n\nCurrent Facts:\n${(facts || []).map((f: string) => `- ${f}`).join("\n")}\n\nChange request: ${userRequest}`;

    const res = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: { "api-subscription-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sarvam-105b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 900,
        reasoning_effort: null,
      }),
    });
    if (!res.ok) throw new Error(`Sarvam Chat failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || "").trim();

    let parsed: { greeting: string; instructions: string; facts: string[]; summary: string };
    try {
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Couldn't parse the AI's response as valid changes — try rephrasing your request.");
    }

    return Response.json(parsed);
  } catch (err: any) {
    return Response.json({ error: err?.message || "Something went wrong." }, { status: 500 });
  }
}
