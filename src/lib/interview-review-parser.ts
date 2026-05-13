import type { InterviewQaPair } from "@/lib/interview-review-types";

const QUESTION_PREFIXES = ["问：", "问:", "问题：", "问题:", "Q：", "Q:"];
const ANSWER_PREFIXES = ["答：", "答:", "回答：", "回答:", "A：", "A:"];

function trimLine(value: string) {
  return value.replace(/\r/g, "").trim();
}

function stripPrefix(value: string, prefixes: string[]) {
  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length).trim();
    }
  }

  return value;
}

function isQuestionLine(line: string) {
  return QUESTION_PREFIXES.some((prefix) => line.startsWith(prefix));
}

function isAnswerLine(line: string) {
  return ANSWER_PREFIXES.some((prefix) => line.startsWith(prefix));
}

export function parseInterviewQaText(rawQaText: string): InterviewQaPair[] {
  const lines = rawQaText
    .split("\n")
    .map(trimLine);

  const items: InterviewQaPair[] = [];
  let currentQuestion = "";
  let answerLines: string[] = [];
  let awaitingAnswer = false;

  function pushCurrent() {
    if (!currentQuestion) {
      return;
    }

    items.push({
      id: `qa_${items.length + 1}`,
      question: currentQuestion,
      answer: answerLines.join("\n").trim(),
      sourceSegmentIds: [],
    });

    currentQuestion = "";
    answerLines = [];
    awaitingAnswer = false;
  }

  for (const line of lines) {
    if (!line) {
      if (awaitingAnswer && answerLines.length > 0) {
        answerLines.push("");
      }
      continue;
    }

    if (isQuestionLine(line)) {
      pushCurrent();
      currentQuestion = stripPrefix(line, QUESTION_PREFIXES);
      awaitingAnswer = true;
      continue;
    }

    if (isAnswerLine(line)) {
      if (!currentQuestion) {
        continue;
      }

      answerLines.push(stripPrefix(line, ANSWER_PREFIXES));
      awaitingAnswer = true;
      continue;
    }

    if (!currentQuestion) {
      continue;
    }

    if (awaitingAnswer) {
      answerLines.push(line);
      continue;
    }
  }

  pushCurrent();

  return items.filter((item) => item.question.trim());
}
