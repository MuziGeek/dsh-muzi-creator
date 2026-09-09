/** Display-only groups retain every character of the saved summary in order. */
interface SummaryGroup {
  title: string;
  paragraphs: string[];
}

function paragraphs(text: string): string[] {
  const result: string[] = [];
  const closing: string[] = [];
  const pairs: Record<string, string> = { "（": "）", "(": ")", "“": "”", "‘": "’", "「": "」", "『": "』" };
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (pairs[char] !== undefined) closing.push(pairs[char]);
    else if (char === closing.at(-1)) closing.pop();
    if (closing.length === 0 && (char === "\n" || (index - start >= 72 && /[。！？；]/u.test(char)))) {
      const piece = text.slice(start, index + 1);
      if (piece.trim() === "" && result.length > 0) result[result.length - 1] += piece;
      else result.push(piece);
      start = index + 1;
    }
  }
  if (start < text.length) result.push(text.slice(start));
  return result;
}

/**
 * Promotes consecutive numbered labels at sentence starts and spaces long prose.
 * @param text Original plain-text summary, including its punctuation and whitespace.
 * @returns Ordered display groups whose titles and paragraphs concatenate to the original text.
 */
export function layoutSummary(text: string): SummaryGroup[] {
  const headings = Array.from(text.matchAll(/(?:^|(?<=[。！？\n]))[ \t]*[（(](\d{1,2})[）)][ \t]*[^：:\n。！？]{2,32}[：:]/gu));
  if (headings.length < 2 || headings.some((heading, index) => Number(heading[1]) !== index + 1)) {
    return [{ title: "", paragraphs: paragraphs(text) }];
  }
  const result: SummaryGroup[] = [];
  const first = headings[0]!;
  if (first.index > 0) result.push({ title: "", paragraphs: paragraphs(text.slice(0, first.index)) });
  for (const [index, heading] of headings.entries()) {
    const end = headings[index + 1]?.index ?? text.length;
    result.push({ title: heading[0], paragraphs: paragraphs(text.slice(heading.index + heading[0].length, end)) });
  }
  return result;
}
