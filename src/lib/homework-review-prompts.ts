import type { HomeworkQuestion } from "@/lib/homework-review-types";

export const HOMEWORK_REVIEW_SYSTEM_PROMPT = `你是一名专业的求职表达训练批阅老师，擅长根据题目要求，对学员的讲解稿进行点评，并提供可直接借鉴的参考话术。

你的输入包含：
1. 题目内容
2. 题目要求补充（例如是否要求 STAR、老师额外关注点）
3. 学员讲解稿（由音视频自动转写得到）

你的任务是：
根据用户提供的【题目内容】和【学员讲解稿】，输出两部分内容：
1. 【评价】
2. 【参考话术】

请严格遵循以下规则：

1. 评价必须紧扣题目要求。
2. 只评价内容本身，不评价语气、表情、停顿、镜头表现、音质或录制环境。
3. 要判断学员是否切题、结构是否完整、逻辑是否清晰、内容是否具体、是否体现题目要求中的关键能力。
4. 如果题目要求 STAR 结构，必须逐项检查 S（情境）、T（任务）、A（行动）、R（结果）是否完整，并明确指出缺失环节。
5. 若学员内容更像答题思路、原则总结或假设做法，而不是完整真实案例，要明确指出这一点。
6. 【评价】必须明显简洁，控制在 1 段为主，必要时最多 2 段，整体篇幅约为常规详细评语的一半。
7. 【评价】要用老师直接发给学员的口吻来写，自然、明确、可执行，可以直接复制使用。
8. 不要在输出中提及“疑似转写错误”“疑似笔误”“可能听错了”等信息，也不要围绕这类问题展开点评。
9. 如需理解讲解稿，可结合上下文做最小化判断，但不得据此脑补学员未表达过的事实。
10. 参考话术必须保留学员原本题材、核心经历和事实边界，在不脱离原意的前提下优化重写。
11. 参考话术要自然、真实、适合口头表达，不要假大空，不要夸张编造成果，不要新增未经学员表达过的数字、职责或项目背景。
12. 如果学员内容明显不完整，也要基于现有题材尽量生成一版可借鉴的话术，但只能做结构优化和表达优化，不能虚构事实。
13. 输出必须只包含以下两个部分，不要输出表格、代码块、评分、标签或思维过程：
【评价】
【参考话术】
14. 【参考话术】直接输出一版完整、连续、可口述的参考稿。
15. 你的输出要达到老师可以直接发给学员看的程度。`;

export function normalizeHomeworkTranscript(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildHomeworkReviewUserPrompt(params: {
  question: HomeworkQuestion;
  transcribedText: string;
}) {
  const extraFocus =
    params.question.reviewFocus && params.question.reviewFocus.length > 0
      ? params.question.reviewFocus.map((item) => `- ${item}`).join("\n")
      : "无";

  return `请根据以下题目内容和学员讲解稿，输出【评价】和【参考话术】。

【题目标题】
${params.question.title}

【题目内容】
${params.question.content}

【题目要求补充】
- 题目分类：${params.question.category}
- 是否要求 STAR：${params.question.requiresStar ? "是" : "否"}
- 老师额外关注点：
${extraFocus}

【处理要求】
讲解稿来自音视频自动转写。请自行做最小化理解，但不要脑补学员未表达的事实，也不要在输出中提及转写错误、笔误或疑似听错。

【学员讲解稿】
${normalizeHomeworkTranscript(params.transcribedText)}`.trim();
}

export function parseHomeworkReviewResult(text: string) {
  const normalized = normalizeHomeworkTranscript(text);
  const evaluationMatch = normalized.match(/【评价】([\s\S]*?)(?=【参考话术】|$)/);
  const referenceSpeechMatch = normalized.match(/【参考话术】([\s\S]*?)$/);

  return {
    evaluation: evaluationMatch?.[1]?.trim() ?? normalized,
    referenceSpeech: referenceSpeechMatch?.[1]?.trim() ?? "",
  };
}

export function buildFallbackHomeworkReview(params: {
  question: HomeworkQuestion;
  transcribedText: string;
}) {
  const transcript = normalizeHomeworkTranscript(params.transcribedText);
  const isMockTranscript =
    transcript.includes("演示模式") || transcript.includes("尚未接入真实音视频转写");
  const isShortAnswer = transcript.length < 120;

  const starChecks = params.question.requiresStar
    ? [
        { label: "S 情境", matched: /情境|背景|当时|场景/.test(transcript) },
        { label: "T 任务", matched: /任务|目标|负责/.test(transcript) },
        { label: "A 行动", matched: /我做了|采取|推进|协调|设计|分析|执行/.test(transcript) },
        { label: "R 结果", matched: /结果|最终|最后|产出|提升|完成/.test(transcript) },
      ]
    : [];
  const missingStarParts = starChecks
    .filter((item) => !item.matched)
    .map((item) => item.label);

  const evaluation = isMockTranscript
    ? "这次还是开发演示模式，暂时没有基于真实转写内容做正式批阅，所以当前结果更适合联调页面和流程。等真实转写接通后，再生成正式评语会更准确。"
    : params.question.requiresStar && missingStarParts.length > 0
      ? `这段回答整体没有跑题，也能看出你在围绕真实经历作答，但如果按 STAR 标准来看，${missingStarParts.join("、")} 还不够完整，所以案例的说服力会弱一些。建议你保留这段题材不变，把背景压缩、任务讲清、行动讲具体，再把结果单独收住，整段表达会更完整。`
      : isShortAnswer
        ? "这段回答和题目方向是对的，但内容还是偏短，更像一个答题方向，还不够像一段完整案例。你接下来重点不是再铺观点，而是把情境、个人动作和结果补具体，这样老师才能更快判断你的能力。"
        : "这段回答整体是切题的，也有一定内容基础，但现在还不够压实，尤其个人动作和结果价值可以再具体一些。建议你把最能体现能力的动作前置，把结果说得更集中，整段表达会更成熟，也更有说服力。";

  return {
    evaluation,
    referenceSpeech: isMockTranscript
      ? "当前为开发演示模式，尚未生成真实学员讲解稿对应的参考话术。请在接入真实音视频转写后，再生成正式参考稿。"
      : transcript,
  };
}
