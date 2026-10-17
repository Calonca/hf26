// Runs the edge model (src/lib/edgeModel.ts) in the browser via transformers.js, off the main thread.
// Weights are fetched from the Hugging Face Hub on first use and kept in the browser Cache Storage.
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  TextStreamer,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import { EDGE_MODEL } from "@/lib/edgeModel";
import type { PromptSpec } from "@/server/ai/tasks";

export type WorkerIn = { type: "generate"; id: number; spec: PromptSpec } | { type: "interrupt" };
export type WorkerOut =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "ready"; device: "webgpu" | "wasm" }
  | { type: "token"; id: number; text: string }
  | { type: "done"; id: number; text: string }
  | { type: "error"; id?: number; message: string };

const post = (m: WorkerOut) => self.postMessage(m);
const stopping = new InterruptableStoppingCriteria();

let loading: Promise<{ tokenizer: PreTrainedTokenizer; model: PreTrainedModel }> | undefined;

async function hasWebGPU() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  return !!gpu && !!(await gpu.requestAdapter().catch(() => null));
}

function load() {
  return (loading ??= (async () => {
    const device = (await hasWebGPU()) ? "webgpu" : "wasm";
    const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress") post({ type: "progress", file: p.file ?? "", loaded: p.loaded ?? 0, total: p.total ?? 0 });
    };
    const tokenizer = await AutoTokenizer.from_pretrained(EDGE_MODEL, { progress_callback });
    const model = await AutoModelForCausalLM.from_pretrained(EDGE_MODEL, {
      device,
      dtype: device === "webgpu" ? "q4f16" : "q4",
      progress_callback,
    });
    post({ type: "ready", device });
    return { tokenizer, model };
  })().catch((err) => {
    loading = undefined; // allow a retry after a failed download
    throw err;
  }));
}

async function generate(id: number, spec: PromptSpec) {
  const { tokenizer, model } = await load();
  // transformers.js has no constrained decoding, so the schema goes in the prompt and the server validates.
  const messages = [
    { role: "system", content: `${spec.system}\nThe JSON must match this JSON schema:\n${JSON.stringify(spec.jsonSchema)}` },
    { role: "user", content: spec.prompt },
  ];
  const inputs = tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    return_dict: true,
    // Forwarded to the Qwen3.5 chat template: answer directly, no <think> block.
    ...({ enable_thinking: false } as object),
  });
  let text = "";
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk) => {
      text += chunk;
      post({ type: "token", id, text: chunk });
    },
  });
  stopping.reset();
  // Greedy decoding makes small models loop until the JSON is cut off; Qwen's non-thinking sampling settings avoid that.
  await model.generate({
    ...(inputs as object),
    max_new_tokens: 768,
    do_sample: true,
    temperature: 0.7,
    top_p: 0.8,
    top_k: 20,
    repetition_penalty: 1.05,
    streamer,
    stopping_criteria: stopping,
  });
  post({ type: "done", id, text: text.trim() });
}

self.addEventListener("message", (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === "interrupt") return stopping.interrupt();
  generate(msg.id, msg.spec).catch((err) => post({ type: "error", id: msg.id, message: String(err?.message ?? err) }));
});
