import type { z } from 'zod';

/**
 * Which AI writes summaries and audience analyses. Claude is used whenever an Anthropic key is
 * set; Gemini remains as a fallback for deployments that only have a Gemini key.
 */
export type Provider = 'claude' | 'gemini';

/** ANTHROPIC_API_KEY is the SDK's usual name; ANTHROPIC_KEY is accepted too. */
export const anthropicKey = () => process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY || '';
export const aiProvider = (): Provider | null =>
  anthropicKey() ? 'claude' : process.env.GEMINI_API_KEY ? 'gemini' : null;
export const aiConfigured = () => aiProvider() !== null;
export const aiModel = () =>
  aiProvider() === 'gemini'
    ? process.env.GEMINI_MODEL || 'gemini-flash-latest'
    : process.env.ANTHROPIC_MODEL || 'claude-opus-5';
export const aiModelSetting = () => (aiProvider() === 'gemini' ? 'GEMINI_MODEL' : 'ANTHROPIC_MODEL');
export const aiName = () => (aiProvider() === 'gemini' ? 'Gemini' : 'Claude');
export const aiKeyHelp = 'Set ANTHROPIC_KEY (or GEMINI_API_KEY) on the server.';

export type Generate = (args: {
  model: string;
  system: string;
  prompt: string;
  signal: AbortSignal;
  /** Output shape as a Zod schema (Claude) and as Gemini's JSON-schema subset. */
  zod: z.ZodType;
  schema: object;
  /** Claude only: how much thinking to spend. Default high; low suits quick, simple asks. */
  effort?: 'low' | 'medium' | 'high';
}) => Promise<{ text: string | undefined; input: number | null; output: number | null }>;

/** An error carrying the HTTP-like status the callers map to a plain reason. */
const statusError = (message: string, status: number) => Object.assign(new Error(message), { status });

/** Claude, with structured JSON output and server-side fallback if a request is declined. */
export async function claudeGenerate({
  model,
  system,
  prompt,
  signal,
  zod,
  effort,
}: Parameters<Generate>[0]) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { betaZodOutputFormat } = await import('@anthropic-ai/sdk/helpers/beta/zod');
  const client = new Anthropic({ apiKey: anthropicKey() });
  const format = betaZodOutputFormat(zod);
  // Streamed because long analyses can exceed the SDK's non-streaming time limit.
  const run = (enforced: boolean) =>
    client.beta.messages
      .stream(
        {
          model,
          max_tokens: 32000,
          system: enforced
            ? system
            : `${system}\n\nReply with only one JSON object, no prose or code fences, matching this JSON Schema:\n${JSON.stringify(format.schema)}`,
          messages: [{ role: 'user', content: prompt }],
          output_config: {
            ...(enforced && { format: { type: format.type, schema: format.schema } }),
            ...(effort && { effort }),
          },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal },
      )
      .finalMessage();
  let res;
  try {
    res = await run(true);
  } catch (e) {
    // When only Anthropic's structured-output service is down, ask for JSON in the prompt instead.
    // Callers validate every answer against the same schema, so nothing unchecked gets through.
    if (!(e instanceof Anthropic.APIError && /grammar/i.test(e.message))) throw e;
    res = await run(false);
  }
  if (res.stop_reason === 'refusal') throw statusError('Claude declined the request.', 451);
  if (res.stop_reason === 'max_tokens') throw statusError('Claude ran out of output space.', 413);
  const text = res.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, '');
  return { text, input: res.usage.input_tokens, output: res.usage.output_tokens };
}

/** Gemini, kept as a fallback provider. */
export async function geminiGenerate({ model, system, prompt, signal, schema }: Parameters<Generate>[0]) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      temperature: 0.2,
      abortSignal: signal,
    },
  });
  return {
    text: res.text,
    input: res.usageMetadata?.promptTokenCount ?? null,
    output: res.usageMetadata?.candidatesTokenCount ?? null,
  };
}

export const aiGenerate: Generate = (args) =>
  aiProvider() === 'gemini' ? geminiGenerate(args) : claudeGenerate(args);

/** Plain-language reason for a failed request. Overloaded = 503 (Gemini) or 529 (Claude). */
export function aiFailureReason(e: unknown, model: string, timeoutSeconds: number): string {
  const status =
    typeof e === 'object' && e && 'status' in e ? Number((e as { status: unknown }).status) : null;
  const name = aiName();
  if (status === 401 || status === 403) return `${name} rejected the API key.`;
  if (status === 404) return `${name} model "${model}" was not found; set ${aiModelSetting()}.`;
  if (status === 429) return `${name} rate limit or quota reached; try again later.`;
  if (status === 451) return `${name} declined to analyse this content.`;
  if (status === 413) return `${name} ran out of output space before finishing.`;
  if (isOverloaded(e)) {
    // 5xx covers more than load (e.g. "credential validation failed"), so pass the provider's reason on.
    const detail = (e instanceof Error ? e.message : '').replace(/^\d{3}\s*/, '').slice(0, 120);
    return status === 529 || /overload|high demand/i.test(detail) || !detail
      ? `${name} is overloaded right now. Try again in a few minutes.`
      : `${name} is temporarily unavailable (${detail}). Try again in a few minutes.`;
  }
  if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'))
    return `${name} did not answer within ${timeoutSeconds} seconds.`;
  return `The ${name} request failed.`;
}
export function isOverloaded(e: unknown) {
  const status =
    typeof e === 'object' && e && 'status' in e ? Number((e as { status: unknown }).status) : null;
  return status === 503 || status === 529 || status === 500;
}
