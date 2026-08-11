import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4Usage,
  LanguageModelV4Prompt,
  LanguageModelV4Message,
} from "@ai-sdk/provider";

const CLOUDFLARE_BASE_URL = "https://api.cloudflare.com/client/v4/accounts";

export function createCloudflareAiGatewayProvider(accountId: string, apiToken: string) {
  return (modelId: string): LanguageModelV4 =>
    createCloudflareAiModel({ accountId, apiToken, modelId });
}

export function requireCloudflareAccountId(): string {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured");
  return accountId;
}

export function requireCloudflareApiToken(): string {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) throw new Error("CLOUDFLARE_API_TOKEN is not configured");
  return apiToken;
}

export function requireCloudflareAiModel(): string {
  const model = process.env.CLOUDFLARE_AI_MODEL;
  if (!model) throw new Error("CLOUDFLARE_AI_MODEL is not configured");
  return model;
}

function createCloudflareAiModel({
  accountId,
  apiToken,
  modelId,
}: {
  accountId: string;
  apiToken: string;
  modelId: string;
}): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "cloudflare",
    modelId,
    supportedUrls: { "*/*": [] },
    async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
      const body = buildCloudflareRequestBody(options);
      const endpoint = `${CLOUDFLARE_BASE_URL}/${accountId}/ai/run/${modelId}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          ...(options.headers ?? {}),
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      const parsed: any = tryParseJson(text);
      if (!response.ok) {
        const errorMessage =
          parsed && typeof parsed === "object" && "error" in parsed
            ? getCloudflareErrorMessage(parsed)
            : text;
        throw new Error(`Cloudflare AI request failed: ${errorMessage}`);
      }

      const contentText = extractResponseText(parsed);

      return {
        content: contentText ? [{ type: "text", text: contentText }] : [],
        finishReason: mapFinishReason(getFinishReason(parsed)),
        usage: normalizeUsage(parsed?.result?.usage ?? parsed?.usage),
        providerMetadata: {},
        request: { body },
        response: {
          headers: Object.fromEntries(response.headers.entries()),
          body: parsed,
        },
        warnings: [],
      };
    },
    async doStream(_options: LanguageModelV4CallOptions): Promise<import("@ai-sdk/provider").LanguageModelV4StreamResult> {
      throw new Error("Cloudflare Workers AI streaming is not supported");
    },
  };
}

function buildCloudflareRequestBody(options: LanguageModelV4CallOptions) {
  const body: Record<string, unknown> = {
    messages: convertPrompt(options.prompt),
  };

  if (typeof options.maxOutputTokens === "number") {
    body.max_tokens = options.maxOutputTokens;
  }
  if (typeof options.temperature === "number") {
    body.temperature = options.temperature;
  }
  if (typeof options.topP === "number") {
    body.top_p = options.topP;
  }
  if (Array.isArray(options.stopSequences) && options.stopSequences.length > 0) {
    body.stop_sequences = options.stopSequences;
  }
  if (typeof options.presencePenalty === "number") {
    body.presence_penalty = options.presencePenalty;
  }
  if (typeof options.frequencyPenalty === "number") {
    body.frequency_penalty = options.frequencyPenalty;
  }
  const responseFormat = options.responseFormat as
    | { type?: string; schema?: unknown }
    | undefined;
  if (responseFormat?.type === "json") {
    body.response_format = responseFormat.schema
      ? { type: "json_schema", json_schema: responseFormat.schema }
      : { type: "json_object" };
  }

  return body;
}

function convertPrompt(prompt: LanguageModelV4Prompt) {
  return prompt.map((message) => ({
    role: message.role === "tool" ? "user" : message.role,
    content: flattenMessageContent(message),
  }));
}

function flattenMessageContent(message: LanguageModelV4Message) {
  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .map((part: any) => {
      if (part && (part.type === "text" || part.type === "reasoning")) {
        return part.text;
      }
      return JSON.stringify(part);
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

function extractResponseText(parsed: any): string {
  if (parsed == null) return "";
  if (typeof parsed === "string") return parsed.trim();

  // Cloudflare Workers AI REST shape: { result: { response: "..." }, success: true }
  const result = parsed.result ?? parsed;

  if (typeof result === "string") return result.trim();
  if (typeof result?.response === "string") return result.response.trim();
  if (Array.isArray(result?.response)) {
    return result.response
      .map((item: any) => (typeof item === "string" ? item : (item?.text ?? "")))
      .join("")
      .trim();
  }

  const choice = getFirstChoice(result);
  return extractChoiceText(choice);
}

function getFinishReason(parsed: any): unknown {
  const result = parsed?.result ?? parsed;
  return getFirstChoice(result)?.finish_reason ?? result?.finish_reason;
}

function extractChoiceText(choice: any): string {
  if (!choice) return "";
  if (typeof choice === "string") return choice.trim();
  if (typeof choice.response === "string") return choice.response.trim();
  if (typeof choice.text === "string") return choice.text.trim();
  if (typeof choice.output === "string") return choice.output.trim();
  if (Array.isArray(choice.output)) {
    return choice.output
      .map((item: any) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join("")
      .trim();
  }
  if (choice.message) {
    const message = choice.message;
    if (typeof message === "string") return message.trim();
    if (typeof message.content === "string") return message.content.trim();
    if (Array.isArray(message.content)) {
      return message.content
        .map((item: any) => (typeof item === "string" ? item : JSON.stringify(item)))
        .join("")
        .trim();
    }
  }
  return "";
}

function getFirstChoice(parsed: any) {
  if (!parsed || typeof parsed !== "object") return null;
  if (Array.isArray(parsed?.choices) && parsed.choices.length > 0) {
    return parsed.choices[0];
  }
  if (Array.isArray(parsed?.result) && parsed.result.length > 0) {
    return parsed.result[0];
  }
  if (parsed?.output) {
    return parsed.output;
  }
  return parsed;
}

function mapFinishReason(finishReason: unknown): import("@ai-sdk/provider").LanguageModelV4FinishReason {
  return {
    unified:
      finishReason === "length"
        ? "length"
        : finishReason === "stop"
        ? "stop"
        : finishReason === "content_filter"
        ? "content-filter"
        : finishReason === "tool_call" || finishReason === "tool-calls"
        ? "tool-calls"
        : finishReason === "error"
        ? "error"
        : "other",
    raw: typeof finishReason === "string" ? finishReason : undefined,
  };
}

function normalizeUsage(usage: any): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: toNumberOrUndefined(usage?.input_tokens ?? usage?.inputTokens ?? usage?.prompt_tokens),
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: toNumberOrUndefined(usage?.output_tokens ?? usage?.outputTokens ?? usage?.completion_tokens),
      text: toNumberOrUndefined(usage?.output_tokens ?? usage?.outputTokens ?? usage?.completion_tokens),
      reasoning: undefined,
    },
    raw: usage,
  };
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getCloudflareErrorMessage(parsed: any): string {
  const error = parsed?.error;
  if (error && typeof error === "object") {
    return String(error.message ?? JSON.stringify(error));
  }
  return String(parsed?.message ?? JSON.stringify(parsed));
}
