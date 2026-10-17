// Shared between the browser worker (generation) and the API route (cache key).
// Changing the prompt? Bump PROMPT_VERSION so cached briefs are regenerated.

export const BRIEF_MODEL = "onnx-community/Qwen3-0.6B-ONNX";
export const PROMPT_VERSION = "v1";

export type BriefRequest = { subject_type: string; subject_key: string; input: unknown };

export function briefMessages({ subject_type, subject_key, input }: BriefRequest) {
  return [
    {
      role: "system",
      content:
        "You write short, factual briefs about open-source projects and contributors based on vouch data. " +
        "Use only the facts in the JSON you are given. Three sentences at most, no preamble.",
    },
    {
      role: "user",
      content: `Subject: ${subject_type} ${subject_key}\n\nData:\n${JSON.stringify(input, null, 2)}`,
    },
  ];
}
