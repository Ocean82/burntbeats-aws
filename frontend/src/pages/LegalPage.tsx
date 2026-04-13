import privacyMd from "./legal/privacy-policy.md?raw";
import tosMd from "./legal/terms-of-service.md?raw";

type LegalDoc = "privacy-policy" | "terms-of-service";

function getDoc(doc: LegalDoc): { title: string; markdown: string } {
  if (doc === "privacy-policy") return { title: "Privacy Policy", markdown: privacyMd };
  return { title: "Terms of Service", markdown: tosMd };
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { title, markdown } = getDoc(doc);
  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="fire-orb left-[-8rem] top-[-6rem] h-80 w-80" />
        <div className="fire-orb right-[-10rem] top-20 h-[26rem] w-[26rem] opacity-75" />
        <div className="fire-orb bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] opacity-60" />
        <div className="mesh-overlay" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <a
            href="/"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            Back to app
          </a>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
          <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-white/85">
            {markdown}
          </pre>
        </div>
      </div>
    </div>
  );
}

