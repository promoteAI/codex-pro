import { Fragment, type ReactNode } from "react";

/**
 * Dependency-free markdown-to-React renderer for the chat thread.
 *
 * Covers exactly the subset the prototype styles under `.chat-md`:
 * ATX headings, paragraphs, fenced + inline code, unordered/ordered lists,
 * and pipe tables. All input is HTML-escaped before tokenizing, so assistant
 * (untrusted) content is never passed through as raw HTML.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface InlineToken {
  type: "text" | "code" | "strong" | "em" | "mdArrow";
  text: string;
}

/** Inline tokenizer: backtick code, **strong**, *em*, and the `.md-arrow` glyph. */
function inline(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((tok, i) => {
    switch (tok.type) {
      case "code":
        return <code key={i}>{tok.text}</code>;
      case "strong":
        return <strong key={i}>{tok.text}</strong>;
      case "em":
        return <em key={i}>{tok.text}</em>;
      case "mdArrow":
        return <span key={i} className="md-arrow">{tok.text}</span>;
      default:
        return <Fragment key={i}>{tok.text}</Fragment>;
    }
  });
}

function tokenizeInline(raw: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  const push = (type: InlineToken["type"], text: string) => {
    if (!text) return;
    tokens.push({ type, text });
  };
  while (i < raw.length) {
    const rest = raw.slice(i);
    // md-arrow: "→" used in diff/context lines
    const arrow = rest.match(/^→/);
    if (arrow) {
      push("mdArrow", arrow[0]);
      i += arrow[0].length;
      continue;
    }
    const code = rest.match(/^`([^`]+)`/);
    if (code) {
      push("code", escapeHtml(code[1]));
      i += code[0].length;
      continue;
    }
    const strong = rest.match(/^\*\*([^*]+)\*\*/);
    if (strong) {
      push("strong", strong[1]);
      i += strong[0].length;
      continue;
    }
    const em = rest.match(/^_([^_]+)_|\*([^*]+)\*/);
    if (em) {
      push("em", em[1] ?? em[2]);
      i += em[0].length;
      continue;
    }
    // accumulate consecutive plain chars
    const chars = rest.match(/^[^`*_\n→]+|^./);
    const chunk = chars ? chars[0] : rest[0];
    push("text", escapeHtml(chunk));
    i += chunk.length;
  }
  return tokens;
}

interface Block {
  type: "h1" | "h2" | "h3" | "p" | "pre" | "ul" | "ol" | "table" | "hr";
  content?: string;
  items?: string[];
  rows?: Array<Array<{ header?: boolean; text: string }>>;
  headerCells?: string[];
}

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const isBlank = (l: string) => l.trim() === "";

  // Flush consecutive paragraph lines until a blank line or new block starter.
  const flushParagraph = (start: number): number => {
    let j = start;
    const para: string[] = [];
    while (j < lines.length) {
      const l = lines[j];
      if (isBlank(l)) break;
      const t = l.trim();
      if (/^#{1,3}\s/.test(t)) break;
      if (/^```/.test(t)) break;
      if (/^[-*]\s+/.test(t)) break;
      if (/^\d+[.)]\s+/.test(t)) break;
      if (/^\|/.test(t)) break;
      para.push(t);
      j++;
    }
    if (para.length) blocks.push({ type: "p", content: para.join("\n") });
    return j;
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (isBlank(line)) {
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: ("h" + heading[1].length) as Block["type"], content: heading[2] });
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      const fence = line.match(/^```(\w*)/)?.[1] ?? "";
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({
        type: "pre",
        content: (fence ? `\`\`\`${fence}\n` : "") + codeLines.join("\n"),
      });
      continue;
    }

    if (/^\|/.test(line)) {
      // table: collect consecutive pipe rows
      const table: Block = { type: "table", rows: [], headerCells: [] };
      const parseRow = (l: string): string[] =>
        l
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
      // header row
      const headerCells = parseRow(line);
      table.headerCells = headerCells;
      i++;
      // separator row (|---|) — skip
      if (i < lines.length && /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i].trim())) {
        i++;
      }
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        table.rows!.push(parseRow(lines[i].trim()).map((text) => ({ text })));
        i++;
      }
      blocks.push(table);
      continue;
    }

    if (/^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (isBlank(l)) break;
        const li = l.match(/^(?:[-*]|\d+[.)])\s+(.*)$/);
        if (!li) break;
        items.push(li[1]);
        i++;
      }
      blocks.push({ type: ordered ? "ol" : "ul", items });
      continue;
    }

    if (/^---+$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    i = flushParagraph(i);
  }

  return blocks;
}

/** Render markdown string to React nodes wrapped for `.chat-md`. */
export function Markdown({ children }: { children: string }) {
  const blocks = parseBlocks(children ?? "");
  return (
    <div className="chat-md">
      {blocks.map((b, idx) => {
        switch (b.type) {
          case "h1":
            return <h1 key={idx}>{inline(tokenizeInline(b.content!))}</h1>;
          case "h2":
            return <h2 key={idx}>{inline(tokenizeInline(b.content!))}</h2>;
          case "h3":
            return <h3 key={idx}>{inline(tokenizeInline(b.content!))}</h3>;
          case "p":
            return (
              <p key={idx}>
                {b.content!.split("\n").map((line, li) => (
                  <Fragment key={li}>
                    {li > 0 && <br />}
                    {inline(tokenizeInline(line))}
                  </Fragment>
                ))}
              </p>
            );
          case "pre":
            return (
              <pre key={idx}>
                <code>{b.content}</code>
              </pre>
            );
          case "ul":
            return (
              <ul key={idx}>
                {b.items!.map((item, li) => (
                  <li key={li}>{inline(tokenizeInline(item))}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={idx}>
                {b.items!.map((item, li) => (
                  <li key={li}>{inline(tokenizeInline(item))}</li>
                ))}
              </ol>
            );
          case "table":
            return (
              <table key={idx}>
                <thead>
                  <tr>
                    {b.headerCells!.map((c, ci) => (
                      <th key={ci}>{inline(tokenizeInline(c))}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows!.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{inline(tokenizeInline(cell.text))}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          case "hr":
            return <div key={idx} className="chat-hr" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
