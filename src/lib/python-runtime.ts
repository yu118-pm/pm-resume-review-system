import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_COMMAND_CANDIDATES = [
  "python3",
  "python3.12",
  "python3.11",
  "python3.10",
  "python3.9",
  "python",
];
const DEFAULT_ABSOLUTE_CANDIDATES = [
  "/bin/python3",
  "/usr/bin/python3",
  "/usr/bin/python3.12",
  "/usr/bin/python3.11",
  "/usr/bin/python3.10",
  "/usr/local/bin/python3",
  "/usr/local/bin/python3.12",
  "/usr/local/bin/python3.11",
  "/usr/local/bin/python3.10",
  "/opt/homebrew/bin/python3",
  "/opt/homebrew/bin/python3.12",
  "/opt/homebrew/bin/python3.11",
  "/opt/homebrew/bin/python3.10",
  "/Library/Frameworks/Python.framework/Versions/Current/bin/python3",
];

type ResolvePythonCommandOptions = {
  env?: NodeJS.ProcessEnv;
  accessFn?: (candidate: string) => Promise<void>;
  pathEntries?: string[];
  commandCandidates?: string[];
  commonAbsoluteCandidates?: string[];
};

function uniqueStrings(values: Array<string | undefined | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function isPathLike(value: string) {
  return value.includes("/") || value.includes("\\");
}

async function defaultAccessFn(candidate: string) {
  await access(candidate, constants.X_OK);
}

async function findExecutable(
  candidates: string[],
  accessFn: (candidate: string) => Promise<void>,
) {
  for (const candidate of candidates) {
    try {
      await accessFn(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

export async function resolvePythonCommand(
  options: ResolvePythonCommandOptions = {},
) {
  const env = options.env ?? process.env;
  const accessFn = options.accessFn ?? defaultAccessFn;
  const explicitCommand = env.PYTHON_BIN?.trim();
  const pathEntries =
    options.pathEntries ??
    env.PATH?.split(delimiter).filter(Boolean) ??
    [];

  const explicitPathCandidates = uniqueStrings([
    explicitCommand && isPathLike(explicitCommand) ? explicitCommand : null,
  ]);

  const explicitPathMatch = await findExecutable(explicitPathCandidates, accessFn);
  if (explicitPathMatch) {
    return explicitPathMatch;
  }

  const commandCandidates = uniqueStrings([
    explicitCommand && !isPathLike(explicitCommand) ? explicitCommand : null,
    ...(options.commandCandidates ?? DEFAULT_COMMAND_CANDIDATES),
  ]);

  const pathCandidates = pathEntries.flatMap((entry) =>
    commandCandidates.map((command) => join(entry, command)),
  );

  const pathMatch = await findExecutable(pathCandidates, accessFn);
  if (pathMatch) {
    return pathMatch;
  }

  const absolutePathCandidates = uniqueStrings(
    options.commonAbsoluteCandidates ?? DEFAULT_ABSOLUTE_CANDIDATES,
  );

  const absolutePathMatch = await findExecutable(
    absolutePathCandidates,
    accessFn,
  );
  if (absolutePathMatch) {
    return absolutePathMatch;
  }

  throw new Error(
    "未找到可用的 Python 运行时，请在部署环境安装 python3，或通过 PYTHON_BIN 指定可执行文件路径",
  );
}

export async function runPythonScript(scriptPath: string, args: string[]) {
  const pythonCommand = await resolvePythonCommand();
  return execFileAsync(pythonCommand, [scriptPath, ...args]);
}
