import privacyMd from "./legal/privacy-policy.md?raw";
import tosMd from "./legal/terms-of-service.md?raw";

type LegalDoc = "privacy-policy" | "terms-of-service";

function getDoc(doc: LegalDoc): { title: string; markdown: string } {
  if (doc === "privacy-policy") return { title: "Privacy Policy", markdown: privacyMd };
  return { title: "Terms of Service", markdown: tosMd };
}

/**
 * Minimal markdown → HTML renderer for legal docs.
 * Handles headings, bold, horizontal rules, tables, lists, links, and paragraphs.
 * No external dependency needed — legal docs use a predictable subset of markdown.
 */
function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  let inTable = false;
  let tableHeaderDone = false;

  const escHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const escAttr = (s: string) =>
    escHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  const safeHref = (raw: string) => {
    const href = raw.trim();
    if (!/^(https?:\/\/|mailto:|\/|#)/i.test(href)) return "#";
    return escAttr(href);
  };

  const inlineFormat = (s: string) =>
    escHtml(s)
      // bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // inline code
      .replace(/`(.+?)`/g, "<code>$1</code>")
      // links (href scheme-restricted + attribute-escaped)
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_match, label: string, href: string) =>
          `<a href="${safeHref(href)}" target="_blank" rel="noopener noreferrer" class="text-primary-300 underline underline-offset-2 hover:text-primary-200">${label}</a>`,
      );

  const closeList = () => {
    if (inList) { out.push("</ul>"); inList = false; }
  };
  const closeTable = () => {
    if (inTable) { out.push("</tbody></table>"); inTable = false; tableHeaderDone = false; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Horizontal rule
    if (/^---+$/.test(line)) {
      closeList(); closeTable();
      out.push('<hr class="border-border my-6" />');
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      closeList(); closeTable();
      const level = h[1].length;
      const text = inlineFormat(h[2]);
      const cls = [
        "text-2xl font-bold text-foreground mt-8 mb-sm",
        "text-xl font-semibold text-secondary-foreground mt-lg mb-xs",
        "text-base font-semibold text-primary-200/90 mt-lg mb-1 uppercase tracking-wide",
        "text-sm font-semibold text-secondary-foreground mt-md mb-1",
      ][level - 1] ?? "text-base font-semibold text-foreground mt-md mb-1";
      out.push(`<h${level} class="${cls}">${text}</h${level}>`);
      continue;
    }

    // Table row
    if (line.startsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      // Separator row (---|---)
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        if (!tableHeaderDone) {
          out.push("</tr></thead><tbody>");
          tableHeaderDone = true;
        }
        continue;
      }
      if (!inTable) {
        closeList();
        out.push('<div class="overflow-x-auto my-4"><table class="w-full text-sm border-collapse">');
        out.push('<thead><tr>');
        inTable = true;
        tableHeaderDone = false;
      } else if (tableHeaderDone) {
        out.push("<tr>");
      }
      const tag = tableHeaderDone ? "td" : "th";
      const cellCls = tableHeaderDone
        ? "border border-border px-sm py-xs text-secondary-foreground"
        : "border border-border px-sm py-xs text-left text-muted-foreground font-semibold bg-muted";
      cells.forEach((c) => out.push(`<${tag} class="${cellCls}">${inlineFormat(c)}</${tag}>`));
      if (tableHeaderDone) out.push("</tr>");
      continue;
    }
    if (inTable) { closeTable(); }

    // List item
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul class="list-none space-y-1.5 my-3 ml-1">'); inList = true; }
      const text = inlineFormat(line.replace(/^[-*]\s+/, ""));
      out.push(`<li class="flex gap-xs text-secondary-foreground"><span class="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-400/70"></span><span>${text}</span></li>`);
      continue;
    }
    closeList();

    // Blank line
    if (line.trim() === "") {
      out.push('<div class="h-2"></div>');
      continue;
    }

    // Paragraph
    out.push(`<p class="text-readable text-secondary-foreground leading-7">${inlineFormat(line)}</p>`);
  }

  closeList();
  closeTable();
  return out.join("\n");
}

/** Defense-in-depth: strip active content if markdown ever contains raw HTML. */
function sanitizeLegalHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*(["']?)\s*javascript:[^"'>\s]*/gi, 'href=$1#');
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { title, markdown } = getDoc(doc);
  const otherDoc = doc === "privacy-policy" ? "terms-of-service" : "privacy-policy";
  const otherTitle = doc === "privacy-policy" ? "Terms of Service" : "Privacy Policy";

  return (
    <div className="min-h-screen bg-[var(--bg)] text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
        <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
        <div className="fire-orb bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] opacity-60" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto max-w-3xl px-md py-10 sm:px-lg lg:px-xl">
        {/* Nav bar */}
        <nav className="mb-8 flex flex-wrap items-center justify-between gap-sm">
          <a
            href="/"
            className="logo-burnt text-lg"
            aria-label="Burnt Beats home"
          >
            <span className="logo-burnt-fire">Burnt Beats</span>
          </a>
          <div className="flex flex-wrap items-center gap-xs">
            <a
              href={`/${otherDoc}`}
              className="rounded-lg border border-border bg-muted px-sm py-xs text-sm text-secondary-foreground hover:bg-muted hover:text-foreground transition"
            >
              {otherTitle}
            </a>
            <a
              href="/"
              className="rounded-lg border border-primary-400/30 bg-primary-500/10 px-sm py-xs text-sm text-primary-200 hover:bg-primary-500/20 transition"
            >
              ← Back to app
            </a>
          </div>
        </nav>

        {/* Document */}
        <article className="rounded-2xl border border-border bg-muted px-lg py-xl sm:px-10">
          <h1 className="mb-1 text-3xl font-bold text-foreground">{title}</h1>
          <p className="mb-lg text-sm text-muted-foreground">Burnt Beats</p>
          <div
            className="prose-legal"
            dangerouslySetInnerHTML={{ __html: sanitizeLegalHtml(renderMarkdown(markdown)) }}
          />
        </article>

        {/* Footer links */}
        <div className="mt-8 flex flex-wrap justify-center gap-md text-sm text-muted-foreground">
          <a href="/terms-of-service" className="hover:text-secondary-foreground transition">Terms of Service</a>
          <span aria-hidden>·</span>
          <a href="/privacy-policy" className="hover:text-secondary-foreground transition">Privacy Policy</a>
          <span aria-hidden>·</span>
          <a href="/" className="hover:text-secondary-foreground transition">Home</a>
        </div>
      </div>
    </div>
  );
}
