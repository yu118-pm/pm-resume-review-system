import OpenApiUtil from "@alicloud/openapi-util";
import Util from "@alicloud/tea-util";
import * as $Tea from "@alicloud/tea-typescript";

const DEFAULT_TINGWU_ENDPOINT = "tingwu.cn-beijing.aliyuncs.com";
const DEFAULT_TINGWU_REGION = "cn-beijing";
const DEFAULT_SOURCE_LANGUAGE = "cn";
const DEFAULT_TRANSCRIPTION_OUTPUT_LEVEL = 1;

type JsonObject = Record<string, unknown>;

interface TingwuResponseBodyBase {
  Code?: string | number;
  Message?: string;
  RequestId?: string;
}

interface TingwuCreateTaskResponseBody extends TingwuResponseBodyBase {
  Data?: {
    TaskId?: string;
    TaskKey?: string;
    TaskStatus?: string;
  };
}

interface TingwuGetTaskInfoResponseBody extends TingwuResponseBodyBase {
  Data?: {
    ErrorCode?: string;
    ErrorMessage?: string;
    Result?: {
      AutoChapters?: string;
      Transcription?: string;
    };
    TaskId?: string;
    TaskKey?: string;
    TaskStatus?: string;
  };
}

export interface TingwuTaskInfo {
  errorCode?: string;
  errorMessage?: string;
  taskId: string;
  taskKey?: string;
  taskStatus: string;
  transcriptionUrl?: string;
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function getRequiredEnv(name: string) {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }

  return value;
}

function isEnabled(name: string, defaultValue = false) {
  const value = readEnv(name);

  if (!value) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function getTranscriptionOutputLevel() {
  const raw = Number.parseInt(readEnv("TINGWU_TRANSCRIPTION_OUTPUT_LEVEL"), 10);

  if (!Number.isFinite(raw) || (raw !== 1 && raw !== 2)) {
    return DEFAULT_TRANSCRIPTION_OUTPUT_LEVEL;
  }

  return raw;
}

function getTingwuEndpoint() {
  return readEnv("TINGWU_ENDPOINT") || DEFAULT_TINGWU_ENDPOINT;
}

async function callTingwuApi<T extends TingwuResponseBodyBase>(params: {
  body?: JsonObject;
  method: "GET" | "POST" | "PUT";
  pathname: string;
  query?: Record<string, string>;
}) {
  const endpoint = getTingwuEndpoint();
  const accessKeyId = getRequiredEnv("ALIBABA_CLOUD_ACCESS_KEY_ID");
  const accessKeySecret = getRequiredEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
  const request = new $Tea.Request();

  request.protocol = "https";
  request.method = params.method;
  request.pathname = params.pathname;
  request.query = params.query ?? {};
  request.headers = {
    accept: "application/json",
    date: Util.getDateUTCString(),
    host: endpoint,
    "x-acs-signature-method": "HMAC-SHA1",
    "x-acs-signature-nonce": Util.getNonce(),
    "x-acs-signature-version": "1.0",
    "x-acs-version": "2023-09-30",
    "user-agent": Util.getUserAgent("CodexHomeworkReview/1.0"),
  };

  if (params.body) {
    request.body = new $Tea.BytesReadable(Util.toJSONString(params.body));
    request.headers["content-type"] = "application/json";
  }

  const stringToSign = OpenApiUtil.getStringToSign(request);
  request.headers.authorization = `acs ${accessKeyId}:${OpenApiUtil.getROASignature(
    stringToSign,
    accessKeySecret,
  )}`;

  const response = await $Tea.doAction(request, {
    connectTimeout: 10_000,
    readTimeout: 30_000,
  });
  let body: T | undefined;

  if (Util.is4xx(response.statusCode) || Util.is5xx(response.statusCode)) {
    const errBody = await Util.readAsJSON(response.body).catch(async () => ({
      Message: await Util.readAsString(response.body).catch(() => ""),
    }));
    const errMap = Util.assertAsMap(errBody);

    throw new Error(
      `${String(errMap.Code ?? "RequestFailed")}: code: ${
        response.statusCode
      }, ${String(errMap.Message ?? "请求失败")} request id: ${String(
        errMap.RequestId ?? "",
      )}`.trim(),
    );
  }

  body = Util.assertAsMap(await Util.readAsJSON(response.body)) as T;

  if (!body) {
    throw new Error("通义听悟返回了空响应");
  }

  if (
    typeof body.Code !== "undefined" &&
    String(body.Code).trim() !== "" &&
    String(body.Code) !== "0"
  ) {
    throw new Error(body.Message || "通义听悟接口调用失败");
  }

  return body;
}

function buildCreateTaskParameters() {
  const transcription: JsonObject = {
    DiarizationEnabled: false,
    OutputLevel: getTranscriptionOutputLevel(),
  };
  const transcriptionModel = readEnv("TINGWU_TRANSCRIPTION_MODEL");

  if (transcriptionModel) {
    transcription.Model = transcriptionModel;
  }

  const extraParams: JsonObject = {};

  if (isEnabled("TINGWU_DOMAIN_EDUCATION_ENABLED", true)) {
    extraParams.DomainEducationEnabled = true;
  }

  const parameters: JsonObject = {
    AutoChaptersEnabled: false,
    MeetingAssistanceEnabled: false,
    PptExtractionEnabled: false,
    SummarizationEnabled: false,
    TextPolishEnabled: false,
    Transcription: transcription,
    TranslationEnabled: false,
  };

  if (Object.keys(extraParams).length > 0) {
    parameters.ExtraParams = extraParams;
  }

  return parameters;
}

export async function createTingwuOfflineTask(params: {
  fileUrl: string;
  taskKey: string;
}) {
  const body = await callTingwuApi<TingwuCreateTaskResponseBody>({
    body: {
      AppKey: getRequiredEnv("TINGWU_APP_KEY"),
      Input: {
        FileUrl: params.fileUrl,
        SourceLanguage: readEnv("TINGWU_SOURCE_LANGUAGE") || DEFAULT_SOURCE_LANGUAGE,
        TaskKey: params.taskKey,
      },
      Parameters: buildCreateTaskParameters(),
    },
    method: "PUT",
    pathname: "/openapi/tingwu/v2/tasks",
    query: {
      type: "offline",
    },
  });

  const taskId = body.Data?.TaskId?.trim();

  if (!taskId) {
    throw new Error("通义听悟创建任务成功，但未返回 TaskId");
  }

  return {
    taskId,
    taskKey: body.Data?.TaskKey?.trim() || params.taskKey,
    taskStatus: body.Data?.TaskStatus?.trim() || "ONGOING",
  };
}

export async function getTingwuTaskInfo(taskId: string): Promise<TingwuTaskInfo> {
  const body = await callTingwuApi<TingwuGetTaskInfoResponseBody>({
    method: "GET",
    pathname: `/openapi/tingwu/v2/tasks/${encodeURIComponent(taskId)}`,
  });
  const data = body.Data;

  return {
    errorCode: data?.ErrorCode?.trim() || undefined,
    errorMessage: data?.ErrorMessage?.trim() || undefined,
    taskId: data?.TaskId?.trim() || taskId,
    taskKey: data?.TaskKey?.trim() || undefined,
    taskStatus: data?.TaskStatus?.trim() || "UNKNOWN",
    transcriptionUrl: data?.Result?.Transcription?.trim() || undefined,
  };
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildTextFromWords(words: unknown[]) {
  return words
    .map((word) => {
      const item = asObject(word);
      return item ? readText(item.Text ?? item.text) : "";
    })
    .filter(Boolean)
    .join("");
}

function buildTextFromSentence(sentence: unknown) {
  const item = asObject(sentence);

  if (!item) {
    return "";
  }

  const directText = readText(item.Text ?? item.text);

  if (directText) {
    return directText;
  }

  return buildTextFromWords(asArray(item.Words ?? item.words)).trim();
}

function buildTextFromParagraph(paragraph: unknown) {
  const item = asObject(paragraph);

  if (!item) {
    return "";
  }

  const directText = readText(item.Text ?? item.text);

  if (directText) {
    return directText;
  }

  const sentenceTexts = asArray(item.Sentences ?? item.sentences)
    .map((sentence) => buildTextFromSentence(sentence))
    .filter(Boolean);

  if (sentenceTexts.length > 0) {
    return sentenceTexts.join("");
  }

  return buildTextFromWords(asArray(item.Words ?? item.words)).trim();
}

function findParagraphs(payload: JsonObject) {
  const candidates = [
    payload.Transcription,
    payload.transcription,
    payload.Result,
    payload.result,
    payload,
  ];

  for (const candidate of candidates) {
    const value = asObject(candidate);

    if (!value) {
      continue;
    }

    const paragraphs = asArray(value.Paragraphs ?? value.paragraphs);

    if (paragraphs.length > 0) {
      return paragraphs;
    }
  }

  return [];
}

function extractTranscriptText(payload: JsonObject) {
  const paragraphs = findParagraphs(payload);
  const paragraphTexts =
    paragraphs.length > 0
      ? paragraphs
          .map((paragraph) => buildTextFromParagraph(paragraph))
          .filter(Boolean)
      : [];
  const deduped = paragraphTexts.filter(
    (text, index) => paragraphTexts.indexOf(text) === index,
  );
  const joined = deduped.join("\n");

  if (joined.trim()) {
    return joined;
  }

  const directText = readText(
    payload.Text ??
      payload.text ??
      asObject(payload.Transcription)?.Text ??
      asObject(payload.transcription)?.text,
  );

  if (directText) {
    return directText;
  }

  throw new Error("通义听悟转写结果中未找到可用文本");
}

export async function fetchTingwuTranscriptionText(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`下载通义听悟转写结果失败（HTTP ${response.status}）`);
  }

  const raw = (await response.text()).replace(/^\uFEFF/, "").trim();

  if (!raw) {
    throw new Error("通义听悟转写结果为空");
  }

  let payload: unknown;

  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `通义听悟转写结果不是合法 JSON：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const root = asObject(payload);

  if (!root) {
    throw new Error("通义听悟转写结果结构异常");
  }

  return extractTranscriptText(root)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
