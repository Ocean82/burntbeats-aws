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

  const inlineFormat = (s: string) =>
    escHtml(s)
      // bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // inline code
      .replace(/`(.+?)`/g, "<code>$1</code>")
      // links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-amber-300 underline underline-offset-2 hover:text-amber-200">$1</a>');

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
      out.push('<hr class="border-white/10 my-6" />');
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      closeList(); closeTable();
      const level = h[1].length;
      const text = inlineFormat(h[2]);
      const cls = [
        "text-2xl font-bold text-white mt-8 mb-3",
        "text-xl font-semibold text-white/95 mt-6 mb-2",
        "text-base font-semibold text-amber-200/90 mt-5 mb-1 uppercase tracking-wide",
        "text-sm font-semibold text-white/80 mt-4 mb-1",
      ][level - 1] ?? "text-base font-semibold text-white mt-4 mb-1";
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
        ? "border border-white/10 px-3 py-2 text-white/80"
        : "border border-white/10 px-3 py-2 text-left text-white/60 font-semibold bg-white/5";
      cells.forEach((c) => out.push(`<${tag} class="${cellCls}">${inlineFormat(c)}</${tag}>`));
      if (tableHeaderDone) out.push("</tr>");
      continue;
    }
    if (inTable) { closeTable(); }

    // List item
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul class="list-none space-y-1.5 my-3 ml-1">'); inList = true; }
      const text = inlineFormat(line.replace(/^[-*]\s+/, ""));
      out.push(`<li class="flex gap-2 text-white/80"><span class="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400/70"></span><span>${text}</span></li>`);
      continue;
    }
    closeList();

    // Blank line
    if (line.trim() === "") {
      out.push('<div class="h-2"></div>');
      continue;
    }

    // Paragraph
    out.push(`<p class="text-white/80 leading-7">${inlineFormat(line)}</p>`);
  }

  closeList();
  closeTable();
  return out.join("\n");
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { title, markdown } = getDoc(doc);
  const otherDoc = doc === "privacy-policy" ? "terms-of-service" : "privacy-policy";
  const otherTitle = doc === "privacy-policy" ? "Terms of Service" : "Privacy Policy";

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
        <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
        <div className="fire-orb bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] opacity-60" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Nav bar */}
        <nav className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <a
            href="/"
            className="logo-burnt text-lg"
            aria-label="Burnt Beats home"
          >
            <span className="logo-burnt-fire">Burnt Beats</span>
          </a>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/${otherDoc}`}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              {otherTitle}
            </a>
            <a
              href="/"
              className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/20 transition"
            >
              ← Back to app
            </a>
          </div>
        </nav>

        {/* Document */}
        <article className="rounded-2xl border border-white/10 bg-black/20 px-6 py-8 sm:px-10">
          <h1 className="mb-1 text-3xl font-bold text-white">{title}</h1>
          <p className="mb-6 text-sm text-white/40">Burnt Beats</p>
          <div
            className="prose-legal"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
          />
        </article>

        {/* Footer links */}
        <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-white/40">
          <a href="/terms-of-service" className="hover:text-white/70 transition">Terms of Service</a>
          <span aria-hidden>·</span>
          <a href="/privacy-policy" className="hover:text-white/70 transition">Privacy Policy</a>
          <span aria-hidden>·</span>
          <a href="/" className="hover:text-white/70 transition">Home</a>
        </div>
      </div>
    </div>
  );
}
