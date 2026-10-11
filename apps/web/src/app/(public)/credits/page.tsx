import type { Metadata } from "next";
import { Shell } from "@/components/shell/Shell";
import { getMe } from "@/lib/api";

export const metadata: Metadata = { title: "Credits & licenses" };

const CREDITS: { name: string; source: string; license: string; used: string }[] = [
  {
    name: "Watermelon UI — CTA Section 4",
    source: "https://ui.watermelon.sh/block/cta-4",
    license: "MIT (WatermelonCorp registry)",
    used: "Closing call to action on the home page, kept in layout and interaction; copy, colour tokens and content changed.",
  },
  {
    name: "Skiper UI — skiper52 HoverExpand",
    source: "https://skiper-ui.com/v1/skiper52",
    license: "Free version: attribution to Skiper UI required",
    used: "Role picker on Sign in.",
  },
  {
    name: "Skiper UI — skiper28 3D perspective text",
    source: "https://skiper-ui.com",
    license: "Free version: attribution to Skiper UI required",
    used: "Home hero headline (pattern reimplemented).",
  },
  {
    name: "Skiper UI — skiper88 / skiper27 rolling text",
    source: "https://skiper-ui.com",
    license: "Free version: attribution to Skiper UI required",
    used: "The score's drum roll on the result (pattern reimplemented).",
  },
  {
    name: "Aceternity UI — Colourful Text",
    source: "https://ui.aceternity.com/components/colourful-text",
    license: "Aceternity UI free components",
    used: "One word on the home page, on Abyss.",
  },
  {
    name: "Aceternity UI — Parallax Hero Images",
    source: "https://ui.aceternity.com/components/parallax-hero-images",
    license: "Aceternity UI free components",
    used: "Home hero layers, made of Graspchain fragments instead of images.",
  },
  {
    name: "Aceternity UI — Background Beams With Collision",
    source: "https://ui.aceternity.com/components/background-beams-with-collision",
    license: "Aceternity UI free components",
    used: "Verify ceremony.",
  },
  {
    name: "Aceternity UI — Tracing Beam",
    source: "https://ui.aceternity.com/components/tracing-beam",
    license: "Aceternity UI free components",
    used: "The journey thread (pattern reimplemented).",
  },
  {
    name: "Aceternity UI — 3D Card Effect",
    source: "https://ui.aceternity.com/components/3d-card-effect",
    license: "Aceternity UI free components",
    used: "Receipt slip and X-Ray panels (a few degrees).",
  },
  {
    name: "Aceternity Labs — Wispr Flow Text Animation",
    source: "https://ui.aceternity.com/labs/wispr-flow-text-animation",
    license: "Aceternity UI free components",
    used: "Outlined marquee band on the home page (pattern reimplemented).",
  },
  {
    name: "Sera UI — Curved Text, Video Text, Decrypting Text, Number Ticker",
    source: "https://seraui.com",
    license: "MIT",
    used: "Receipt seal, hero word, hashes, score count-up.",
  },
  { name: "Motion", source: "https://motion.dev", license: "MIT", used: "Animation runtime for the effects above." },
  { name: "Fraunces, Geist, Geist Mono", source: "https://fonts.google.com", license: "SIL Open Font License 1.1", used: "Display, interface and mono type." },
];

export default async function CreditsPage() {
  const me = await getMe().catch(() => null);
  return (
    <Shell me={me}>
      <div className="frame-narrow pt-10 md:pt-16">
        <p className="eyebrow">Credits &amp; licenses</p>
        <h1 className="display mt-3 text-[clamp(2.25rem,5vw,3.25rem)]">Built on the work of others</h1>
        <p className="mt-3 text-md text-ink-2">
          Interaction patterns adapted from these libraries, rebuilt in Graspchain&rsquo;s tokens. The ink-in-water loop is generated in this repository
          (scripts/render-ink-loop.mjs).
        </p>
        <ul className="mt-10 divide-y divide-rule rounded-[24px] bg-paper-raised px-6 ring-1 ring-rule">
          {CREDITS.map((c) => (
            <li key={c.name} className="py-5">
              <a
                href={c.source}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-ink underline decoration-teal/30 underline-offset-4 hover:decoration-teal"
              >
                {c.name}
              </a>
              <p className="mt-1 text-sm text-ink-2">{c.used}</p>
              <p className="mt-1 text-xs text-ink-3">{c.license}</p>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}
