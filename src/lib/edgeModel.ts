// The edge model: Qwen3.5 0.8B (text-only build, 4-bit) running in the browser via transformers.js
// (WebGPU q4f16 ≈ 470 MB, WASM q4 fallback ≈ 550 MB).
// It is also the `model` part of the ai_briefs cache key, so changing it regenerates every output.
export const EDGE_MODEL = "onnx-community/Qwen3.5-0.8B-Text-ONNX";

/** "onnx-community/Qwen3.5-0.8B-Text-ONNX" → "Qwen3.5 0.8B" */
export function modelLabel(model: string = EDGE_MODEL) {
  const m = model.match(/([a-z]+[\d.]*)-(\d+(?:\.\d+)?b)/i);
  return m ? `${m[1]} ${m[2].toUpperCase()}` : model;
}
