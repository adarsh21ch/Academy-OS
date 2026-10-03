/**
 * Client-side conversation export helpers (Markdown + clipboard).
 * Pure browser utilities — no server calls.
 */

import type { UIMessage } from "ai";

export function messagesToMarkdown(title: string, messages: UIMessage[]): string {
  const lines: string[] = [`# ${title}`, ""];
  for (const m of messages) {
    const who = m.role === "user" ? "You" : m.role === "assistant" ? "Kaizen" : m.role;
    lines.push(`## ${who}`);
    for (const p of m.parts) {
      if (p.type === "text") lines.push((p as { text: string }).text);
      else if (p.type === "reasoning")
        lines.push(`> _reasoning:_ ${(p as { text: string }).text}`);
      else if (p.type?.startsWith("tool-")) {
        const t = p as { type: string; output?: unknown };
        lines.push(`> **Tool:** \`${t.type.slice("tool-".length)}\``);
        if (t.output) {
          lines.push("```json");
          lines.push(
            typeof t.output === "string" ? t.output : JSON.stringify(t.output, null, 2),
          );
          lines.push("```");
        }
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function downloadMarkdown(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".md") ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
