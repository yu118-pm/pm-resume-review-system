import assert from "node:assert/strict";
import test from "node:test";

import { SYSTEM_PROMPT } from "./prompts.ts";

test("SYSTEM_PROMPT constrains professional strengths to template-style sentence patterns", () => {
  assert.match(SYSTEM_PROMPT, /X年\+岗位方向经验/u);
  assert.match(SYSTEM_PROMPT, /主打XX领域|聚焦XX领域/u);
  assert.match(SYSTEM_PROMPT, /精通/u);
  assert.match(SYSTEM_PROMPT, /熟练掌握/u);
  assert.match(SYSTEM_PROMPT, /了解/u);
  assert.match(SYSTEM_PROMPT, /会用/u);
  assert.match(SYSTEM_PROMPT, /曾做过/u);
  assert.match(SYSTEM_PROMPT, /达成/u);
});
