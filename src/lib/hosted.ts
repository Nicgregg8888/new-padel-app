/**
 * The "hosted" build runs as a claude.ai Artifact: no server of its own, the
 * pose models ship alongside the page, and the AI coach calls Claude through
 * the viewer's account (window.claude) instead of our /api/coach endpoint.
 */
export const HOSTED = import.meta.env.VITE_HOSTED === "true";

interface SampleOptions {
  images?: Blob[];
  modelTier?: "default" | "complex" | "quick";
  signal?: AbortSignal;
}
export interface Sample {
  json<T = unknown>(input: string, options?: SampleOptions): Promise<T>;
  limits(): Promise<{ images?: { maxCount: number } }>;
}
export interface Downloads {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}
export interface SampleError {
  code: string;
  message: string;
}

interface ClaudeRuntime {
  use(name: "sample"): Promise<Sample | null>;
  use(name: "downloads"): Promise<Downloads | null>;
}

export function claudeRuntime(): ClaudeRuntime | null {
  return (window as unknown as { claude?: ClaudeRuntime }).claude ?? null;
}

export function isSampleError(e: unknown): e is SampleError {
  return !!e && typeof e === "object" && typeof (e as SampleError).code === "string";
}
