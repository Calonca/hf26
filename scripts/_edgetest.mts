import "dotenv/config";
import { AutoModelForCausalLM, AutoTokenizer } from "@huggingface/transformers";
import { prepareBrief, toSpec, complete } from "../src/server/ai/tasks";
import { EDGE_MODEL } from "../src/lib/edgeModel";

import { prepareDiscover } from "../src/server/ai/tasks";
const p: any = process.argv[2] === "discover" ? await prepareDiscover("typescript, react, writing docs", "About 3 hours") : await prepareBrief(process.argv[2] ?? "deste04");
const spec = toSpec(p);
const tokenizer = await AutoTokenizer.from_pretrained(EDGE_MODEL);
const model = await AutoModelForCausalLM.from_pretrained(EDGE_MODEL, { dtype: "q4" });
const messages = [
  { role: "system", content: `${spec.system}\nThe JSON must match this JSON schema:\n${JSON.stringify(spec.jsonSchema)}` },
  { role: "user", content: spec.prompt },
];
const inputs: any = tokenizer.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true, ...({ enable_thinking: false } as object) });
console.log("PROMPT TOKENS", inputs.input_ids.dims);
// console.log(tokenizer.decode(Array.from(inputs.input_ids.data as BigInt64Array).slice(-60).map(Number)));
const t = Date.now();
const out: any = await model.generate({ ...inputs, max_new_tokens: 768, do_sample: true, temperature: 0.7, top_p: 0.8, top_k: 20, repetition_penalty: 1.05 });
const raw = tokenizer.batch_decode(out.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true })[0];
console.log("SECS", (Date.now() - t) / 1000);
try { const a=raw.indexOf("{"), b=raw.lastIndexOf("}"); JSON.parse(raw.slice(a,b+1)); console.log("PARSE OK"); } catch (e) { console.log("PARSE ERR", (e as Error).message); console.log("RAW>>>", raw, "<<<"); }
console.log(JSON.stringify(complete(p, raw, "test-model")).slice(0, 500));
