import type { KnowledgePageSummary } from "../muziTypes.ts";

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

function normalizedWikilinkTarget(raw: string): string {
  return raw
    .split("|", 1)[0]!
    .split("#", 1)[0]!
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\.md$/i, "")
    .toLocaleLowerCase();
}

function knowledgeAliases(page: KnowledgePageSummary): string[] {
  const relative = page.locator.slice("atlas://wiki/".length).replace(/\.md$/i, "");
  const base = relative.slice(relative.lastIndexOf("/") + 1);
  return [page.title, base, relative, `wiki/${relative}`].map((value) => value.toLocaleLowerCase());
}

function knowledgeAliasIndex(pages: readonly KnowledgePageSummary[]): Map<string, KnowledgePageSummary | null> {
  const aliases = new Map<string, KnowledgePageSummary | null>();
  for (const page of pages) {
    for (const alias of knowledgeAliases(page)) {
      if (!aliases.has(alias)) {
        aliases.set(alias, page);
        continue;
      }
      if (aliases.get(alias)?.id !== page.id) aliases.set(alias, null);
    }
  }
  return aliases;
}

/** Resolve one visible `[[Wiki link]]` token against the service-approved related pages. */
export function resolveKnowledgeWikiMention(
  value: string,
  related: readonly KnowledgePageSummary[],
): KnowledgePageSummary | null {
  const raw = /^\[\[([^\]\r\n]+)\]\]$/.exec(value)?.[1];
  if (raw === undefined) return null;
  return knowledgeAliasIndex(related).get(normalizedWikilinkTarget(raw)) ?? null;
}

function inlineCodeRanges(line: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor < line.length) {
    const start = line.indexOf("`", cursor);
    if (start < 0) break;
    let openingLength = 1;
    while (line[start + openingLength] === "`") openingLength += 1;
    let search = start + openingLength;
    let closed = false;
    while (search < line.length) {
      const closingStart = line.indexOf("`", search);
      if (closingStart < 0) break;
      let closingLength = 1;
      while (line[closingStart + closingLength] === "`") closingLength += 1;
      if (closingLength === openingLength) {
        ranges.push({ start, end: closingStart + closingLength });
        cursor = closingStart + closingLength;
        closed = true;
        break;
      }
      search = closingStart + closingLength;
    }
    if (!closed) cursor = start + openingLength;
  }
  return ranges;
}

function linkWikiSegment(
  segment: string,
  aliases: ReadonlyMap<string, KnowledgePageSummary | null>,
): { text: string; changed: boolean } {
  let changed = false;
  const text = segment.replace(/\[\[([^\]\r\n]+)\]\]/g, (token: string, raw: string) => {
    if (raw.includes("`") || aliases.get(normalizedWikilinkTarget(raw)) == null) return token;
    changed = true;
    return `\`${token}\``;
  });
  return { text, changed };
}

function linkWikiLine(
  line: string,
  aliases: ReadonlyMap<string, KnowledgePageSummary | null>,
): { text: string; changed: boolean } {
  const ranges = inlineCodeRanges(line);
  if (ranges.length === 0) return linkWikiSegment(line, aliases);
  let changed = false;
  let cursor = 0;
  let text = "";
  for (const range of ranges) {
    const linked = linkWikiSegment(line.slice(cursor, range.start), aliases);
    text += linked.text + line.slice(range.start, range.end);
    changed ||= linked.changed;
    cursor = range.end;
  }
  const tail = linkWikiSegment(line.slice(cursor), aliases);
  return { text: text + tail.text, changed: changed || tail.changed };
}

/**
 * Promote resolved Wiki syntax to inline mention controls for the read-only
 * Markdown renderer. Source Markdown and unresolved or code-contained links
 * remain unchanged.
 */
export function knowledgeLinkedMarkdown(
  markdown: string,
  related: readonly KnowledgePageSummary[],
): string {
  if (related.length === 0) return markdown;
  const aliases = knowledgeAliasIndex(related);
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  let fence: { marker: "`" | "~"; length: number } | null = null;
  let changed = false;
  const linked = lines.map((line) => {
    const trimmed = line.trim();
    if (fence !== null) {
      const closing = /^(?:`+|~+)$/.exec(trimmed)?.[0];
      if (closing !== undefined && closing[0] === fence.marker && closing.length >= fence.length) fence = null;
      return line;
    }
    const opening = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (opening !== undefined) {
      fence = { marker: opening[0] as "`" | "~", length: opening.length };
      return line;
    }
    const result = linkWikiLine(line, aliases);
    changed ||= result.changed;
    return result.text;
  });
  return changed ? linked.join(newline) : markdown;
}

/** Format an ISO-style date as compact Chinese UI copy. */
export function formatKnowledgeDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match === null) return value;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}
