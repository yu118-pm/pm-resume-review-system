import OpenAI from "openai";

const apiKey = process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || "";
const baseURL =
  process.env.DASHSCOPE_BASE_URL ||
  process.env.OPENAI_BASE_URL ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
const model =
  process.env.DASHSCOPE_MODEL || process.env.OPENAI_MODEL || "qwen-plus";

export interface CallLLMOptions {
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
  temperature?: number;
}

export interface LLMCallResult {
  content: string;
  finishReason: string | null;
}

export async function callLLMWithMeta(
  systemPrompt: string,
  userPrompt: string,
  options: CallLLMOptions = {},
): Promise<LLMCallResult> {
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
  return { baseURL, model };
}
