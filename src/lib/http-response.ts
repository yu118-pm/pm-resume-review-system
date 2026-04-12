function normalizeResponseText(raw: string) {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildHttpErrorMessage(
  response: Pick<Response, "status" | "statusText">,
  rawText: string,
  fallbackMessage: string,
) {
  const normalized = normalizeResponseText(rawText);

  if (
    response.status === 413 ||
    /request entity too large/i.test(normalized)
  ) {
    return "上传文件过大，线上环境不能通过应用服务器直接接收该文件";
  }

  if (normalized) {
    return `${fallbackMessage}：${normalized.slice(0, 160)}`;
  }

  return `${fallbackMessage}（HTTP ${response.status || 0}${response.statusText ? ` ${response.statusText}` : ""}）`;
}

export async function readJsonResponse<T>(
  response: Pick<Response, "text" | "status" | "statusText">,
  fallbackMessage: string,
) {
  const raw = (await response.text()).replace(/^\uFEFF/, "").trim();

  if (!raw) {
    throw new Error(buildHttpErrorMessage(response, raw, fallbackMessage));
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(buildHttpErrorMessage(response, raw, fallbackMessage));
  }
}
