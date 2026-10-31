/** Deliberately narrow: identifiers, filenames and short follow-ups are valid input. */
export function isAccidentalInput(prompt: string) {
  const text = prompt.trim().toLowerCase();
  return /^(?:(?:qwe){2,}|(?:asd){2,}|(?:zxc){2,}|(?:йцу){2,}|(?:фыв){2,}|qwerty(?:uiop)?|asdfgh(?:jkl)?|zxcvbnm)$/.test(
    text,
  );
}

const normalized = (text: string) =>
  text
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s.!?…]+/gu, ' ')
    .trim();
const placeholder =
  /^(?:(?:option|choice|answer|вариант|ответ)\s*[-_:]?\s*(?:\d+|[abcабв])|[abcабв]|\d+|\.{3}|…|todo|tbd|placeholder)$/iu;

export function hasMeaningfulClarification(
  question: string,
  options: { label: string }[],
  prompt: string,
) {
  const labels = options.map((option) => normalized(option.label));
  return (
    normalized(question) !== normalized(prompt) &&
    !isAccidentalInput(question) &&
    options.length === 3 &&
    labels.every((label) => label.length > 0 && !placeholder.test(label)) &&
    new Set(labels).size === labels.length
  );
}

export const TASK_DESCRIPTION_HINT =
  'I couldn’t identify a task in that message. Describe what you’d like to build, change, or understand.';
export const INVALID_QUESTION_HINT =
  'I couldn’t formulate a useful clarification. Please describe the desired result or add the missing requirements in the chat.';
