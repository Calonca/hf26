// Runs the brief model in the browser via transformers.js, off the main thread.
// Weights are fetched from the Hugging Face Hub on first use and kept in the browser Cache Storage.
import {
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  TextStreamer,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import { BRIEF_MODEL, briefMessages, type BriefRequest } from "@/lib/brief";

export type WorkerIn = { type: "generate"; id: number; req: BriefRequest } | { type: "interrupt" };
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
    const tokenizer = await AutoTokenizer.from_pretrained(BRIEF_MODEL, { progress_callback });
    const model = await AutoModelForCausalLM.from_pretrained(BRIEF_MODEL, {
      device,
      dtype: device === "webgpu" ? "q4f16" : "q4",
      progress_callback,
    });
    post({ type: "ready", device });
    return { tokenizer, model };
  })());
}

async function generate(id: number, req: BriefRequest) {
  const { tokenizer, model } = await load();
  const inputs = tokenizer.apply_chat_template(briefMessages(req), {
    add_generation_prompt: true,
    return_dict: true,
    // Forwarded to the Qwen3 chat template: skip the <think> block.
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
  await model.generate({ ...inputs, max_new_tokens: 200, do_sample: false, streamer, stopping_criteria: stopping });
  post({ type: "done", id, text: text.trim() });
}

self.addEventListener("message", (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === "interrupt") return stopping.interrupt();
  generate(msg.id, msg.req).catch((err) => post({ type: "error", id: msg.id, message: String(err?.message ?? err) }));
});
