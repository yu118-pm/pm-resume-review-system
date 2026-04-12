const MAX_HOMEWORK_REVIEW_FILE_SIZE_BYTES = 500 * 1024 * 1024;
const SUPPORTED_HOMEWORK_REVIEW_EXTENSIONS = [
  ".mp3",
  ".mp4",
  ".wav",
  ".m4a",
  ".flac",
  ".aac",
  ".mov",
] as const;

function normalizeName(value: string | undefined) {
  return value?.trim() ?? "";
}

export interface HomeworkReviewSourceMeta {
  fileName: string;
  fileSize: number;
  fileType?: string;
}

export function getHomeworkReviewMaxFileSizeBytes() {
  return MAX_HOMEWORK_REVIEW_FILE_SIZE_BYTES;
}

export function isSupportedHomeworkReviewMediaFile(input: HomeworkReviewSourceMeta) {
  const fileName = normalizeName(input.fileName).toLowerCase();
  const fileType = normalizeName(input.fileType).toLowerCase();

  return (
    fileType.startsWith("audio/") ||
    fileType.startsWith("video/") ||
    SUPPORTED_HOMEWORK_REVIEW_EXTENSIONS.some((ext) => fileName.endsWith(ext))
  );
}

export function validateHomeworkReviewSourceMeta(input: HomeworkReviewSourceMeta) {
  if (!normalizeName(input.fileName) || input.fileSize <= 0) {
    throw new Error("请先上传音视频文件");
  }

  if (input.fileSize > MAX_HOMEWORK_REVIEW_FILE_SIZE_BYTES) {
    throw new Error("文件超过 500MB，请压缩后重试");
  }

  if (!isSupportedHomeworkReviewMediaFile(input)) {
    throw new Error("仅支持 mp3/mp4/wav/m4a/flac/aac/mov 格式");
  }
}
