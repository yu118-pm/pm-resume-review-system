import assert from "node:assert/strict";
import test from "node:test";

import { resolvePythonCommand } from "./python-runtime.ts";

test("prefers a python binary found in PATH", async () => {
  const attempts = [];

  const command = await resolvePythonCommand({
    env: { PATH: "/custom/bin:/usr/bin" },
    commonAbsoluteCandidates: [],
    accessFn: async (candidate) => {
      attempts.push(candidate);

      if (candidate === "/custom/bin/python3") {
        return;
      }

      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
  });

  assert.equal(command, "/custom/bin/python3");
  assert.deepEqual(attempts, ["/custom/bin/python3"]);
});

test("falls back to a known absolute python path when PATH lookup fails", async () => {
  const attempts = [];

  const command = await resolvePythonCommand({
    env: { PATH: "/custom/bin" },
    commonAbsoluteCandidates: ["/usr/bin/python3"],
    accessFn: async (candidate) => {
      attempts.push(candidate);

      if (candidate === "/usr/bin/python3") {
        return;
      }

      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
  });

  assert.equal(command, "/usr/bin/python3");
  assert.deepEqual(attempts, [
    "/custom/bin/python3",
    "/custom/bin/python3.12",
    "/custom/bin/python3.11",
    "/custom/bin/python3.10",
    "/custom/bin/python3.9",
    "/custom/bin/python",
    "/usr/bin/python3",
  ]);
});

test("supports an explicit PYTHON_BIN override", async () => {
  const attempts = [];

  const command = await resolvePythonCommand({
    env: {
      PATH: "/custom/bin",
      PYTHON_BIN: "/workspace/.venv/bin/python",
    },
    commonAbsoluteCandidates: ["/usr/bin/python3"],
    accessFn: async (candidate) => {
      attempts.push(candidate);

      if (candidate === "/workspace/.venv/bin/python") {
        return;
      }

      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
  });

  assert.equal(command, "/workspace/.venv/bin/python");
  assert.deepEqual(attempts, ["/workspace/.venv/bin/python"]);
});

test("throws an actionable error when no python runtime is available", async () => {
  await assert.rejects(
    resolvePythonCommand({
      env: { PATH: "/custom/bin" },
      commonAbsoluteCandidates: [],
      accessFn: async () => {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    }),
    /未找到可用的 Python 运行时/,
  );
});
