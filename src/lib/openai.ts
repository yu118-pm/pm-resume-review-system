import OpenAI from "openai";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus";

export interface CallLLMOptions {
  maxTokens?: number;
  model?: string;
  responseFormat?: "text" | "json_object";
  temperature?: number;
}

export interface LLMCallResult {
  content: string;
  finishReason: string | null;
}

export interface LLMConfigSummary {
  hasApiKey: boolean;
  baseURL: string;
  model: string;
}

export interface LLMErrorInfo {
  message: string;
  status: number;
  log: Record<string, unknown>;
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function resolveLLMConfig(overrides?: { model?: string }) {
  const apiKey = readEnv("DASHSCOPE_API_KEY") || readEnv("OPENAI_API_KEY");
  const baseURL =
    readEnv("DASHSCOPE_BASE_URL") || readEnv("OPENAI_BASE_URL") || DEFAULT_BASE_URL;
  const model =
    overrides?.model?.trim() ||
    readEnv("DASHSCOPE_MODEL") ||
    readEnv("OPENAI_MODEL") ||
    DEFAULT_MODEL;

  return { apiKey, baseURL, model };
}

function isContextLengthError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("context length") ||
    normalized.includes("context_length_exceeded") ||
    normalized.includes("maximum context length")
  );
}

export async function callLLMWithMeta(
  systemPrompt: string,
  userPrompt: string,
  options: CallLLMOptions = {},
): Promise<LLMCallResult> {
  const { apiKey, baseURL, model } = resolveLLMConfig({
    model: options.model,
  });

  if (!apiKey) {
    throw new Error("缺少模型 API Key，请配置 DASHSCOPE_API_KEY 或 OPENAI_API_KEY");
  }

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  const request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 4096,
    stream: false,
  };

  if (options.responseFormat === "json_object") {
    request.response_format = {
      type: "json_object",
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming["response_format"];
  }

  const response = await client.chat.completions.create(request);

  return {
    content: response.choices[0]?.message?.content ?? "",
    finishReason: response.choices[0]?.finish_reason ?? null,
  };
}

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options?: CallLLMOptions,
) {
  const result = await callLLMWithMeta(systemPrompt, userPrompt, options);

  return result.content;
}

export function getModelConfig() {
  const { baseURL, model } = resolveLLMConfig();

  return { baseURL, model };
}

export function getLLMConfigSummary(): LLMConfigSummary {
  const { apiKey, baseURL, model } = resolveLLMConfig();

  return {
    hasApiKey: Boolean(apiKey),
    baseURL,
    model,
  };
}

export function getLLMErrorInfo(error: unknown): LLMErrorInfo | null {
  if (
    error instanceof Error &&
    error.message.includes("缺少模型 API Key")
  ) {
    return {
      message: "服务端未配置模型 API Key，请检查环境变量",
      status: 503,
      log: { kind: "missing_api_key" },
    };
  }

  if (error instanceof OpenAI.AuthenticationError) {
    return {
      message: "模型服务鉴权失败，请检查 API Key 配置",
      status: 502,
      log: {
        kind: "authentication_error",
        status: error.status,
        code: error.code,
        type: error.type,
        requestId: error.request_id,
      },
    };
  }

  if (error instanceof OpenAI.RateLimitError) {
    return {
      message: "模型服务请求过于频繁，请稍后重试",
      status: 429,
      log: {
        kind: "rate_limit_error",
        status: error.status,
        code: error.code,
        type: error.type,
        requestId: error.request_id,
      },
    };
  }

  if (error instanceof OpenAI.APIConnectionError) {
    return {
      message: "模型服务连接失败，请稍后重试",
      status: 503,
      log: {
        kind: "connection_error",
        cause:
          error.cause instanceof Error
            ? error.cause.message
            : String(error.cause ?? ""),
      },
    };
  }

  if (error instanceof OpenAI.BadRequestError) {
    return {
      message: isContextLengthError(error.message)
        ? "简历内容过长，请精简后重试"
        : "模型请求参数异常，请稍后重试",
      status: isContextLengthError(error.message) ? 400 : 502,
      log: {
        kind: "bad_request_error",
        status: error.status,
        code: error.code,
        type: error.type,
        requestId: error.request_id,
      },
    };
  }

  if (error instanceof OpenAI.InternalServerError) {
    return {
      message: "模型服务暂时不可用，请稍后重试",
      status: 502,
      log: {
        kind: "internal_server_error",
        status: error.status,
        code: error.code,
        type: error.type,
        requestId: error.request_id,
      },
    };
  }

  if (error instanceof OpenAI.APIError) {
    return {
      message: "模型服务请求失败，请稍后重试",
      status: error.status ?? 502,
      log: {
        kind: "api_error",
        status: error.status,
        code: error.code,
        type: error.type,
        requestId: error.request_id,
      },
    };
  }

  return null;
}
