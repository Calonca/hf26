// The ONLY Ollama-specific code. Replace or delete when the model runs in the browser:
// the browser then calls prepareAi() → runs the model → submitAi() (src/server/actions/ai.ts).

export const SERVER_MODEL = process.env.OLLAMA_MODEL ?? "gemma4:e4b";
const HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

/** Returns the raw model text (expected to be JSON matching jsonSchema). Throws if unreachable. */
/**
 * Plain fetch instead of the ollama package: its abort() only cancels streamed requests.
 * Aborting `signal` closes the HTTP connection, which makes Ollama stop generating.
 */
export async function generate(system: string, prompt: string, jsonSchema: object, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      model: SERVER_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      format: jsonSchema,
      options: { temperature: 0.2 },
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { message: { content: string } };
  return data.message.content;
}
