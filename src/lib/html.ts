const ALLOWED_SIMPLE_TAGS = new Set(["p", "br", "strong", "em", "b", "i", "ul", "ol", "li"]);

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function plainTextParagraphsToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function sanitizeSimpleHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/g, (match, tagName: string) => {
      const tag = tagName.toLowerCase();
      if (!ALLOWED_SIMPLE_TAGS.has(tag)) return escapeHtml(match);
      return match.startsWith("</") ? `</${tag}>` : tag === "br" ? "<br>" : `<${tag}>`;
    })
    .replace(/<(?!\/?(?:p|br|strong|em|b|i|ul|ol|li)\b)/gi, "&lt;");
}
