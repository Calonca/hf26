// The ONLY Ollama-specific code. Replace or delete when the model runs in the browser:
// the browser then calls prepareAi() → runs the model → submitAi() (src/server/actions/ai.ts).
import { Ollama } from "ollama";

export const SERVER_MODEL = process.env.OLLAMA_MODEL ?? "gemma4:e4b";
const ollama = new Ollama({ host: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434" });

/** Returns the raw model text (expected to be JSON matching jsonSchema). Throws if unreachable. */
export async function generate(system: string, prompt: string, jsonSchema: object): Promise<string> {
  const res = await ollama.chat({
    model: SERVER_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    format: jsonSchema,
    options: { temperature: 0.2 },
    stream: false,
  });
  return res.message.content;
}
