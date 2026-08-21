function frontmatterEnd(lines: readonly string[]): number | null {
  if (lines[0]?.replace(/^\uFEFF/, "").trim() !== "---") return null;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() !== "---") continue;
    const frontmatter = lines.slice(1, index);
    return frontmatter.some((line) => /^[A-Za-z_][\w-]*\s*:/.test(line)) ? index + 1 : null;
  }
  return null;
}

function normalizedHeading(value: string): string {
  return value.replace(/\s+#+\s*$/, "").replace(/\s+/g, " ").trim();
}

/**
 * Prepare a formal Wiki page for the knowledge reader without changing the
 * source Markdown used for hashing, indexing, or Agent references.
 */
export function knowledgeDisplayMarkdown(markdown: string, title: string): string {
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const end = frontmatterEnd(lines);
  let changed = end !== null;
  let visible = end === null ? [...lines] : lines.slice(end);

  let first = visible.findIndex((line) => line.trim() !== "");
  if (first >= 0) {
    const heading = /^#\s+(.+?)\s*$/.exec(visible[first]!.trim())?.[1];
    if (heading !== undefined && normalizedHeading(heading) === normalizedHeading(title)) {
      let after = first + 1;
      while (after < visible.length && visible[after]?.trim() === "") after += 1;
      visible = [...visible.slice(0, first), ...visible.slice(after)];
      changed = true;
      first = visible.findIndex((line) => line.trim() !== "");
    }
  }

  if (!changed) return markdown;
  return visible.slice(first < 0 ? visible.length : first).join(newline).trimEnd();
}

/** Format an ISO-style date as compact Chinese UI copy. */
export function formatKnowledgeDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match === null) return value;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}
