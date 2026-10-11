import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Closing CTA — Watermelon UI "CTA Section 4" (registry.watermelon.sh/r/cta-4.json, MIT),
 * installed from its registry item and kept in its layout, structure, proportions, spacing,
 * type scale and hover interaction (the device rises on hover). Changed: copy, brand colour
 * tokens (primary → Teal, zinc frame → Abyss, emerald/rose deltas → status marks with words),
 * react-icons → the app's icon set, and the demo metrics → this deployment's real configuration.
 * One addition the brief asks for: the secondary "Verify a receipt" link beside the CTA.
 */
export interface CtaMetric {
  id: string;
  label: string;
  value: string;
  note: string;
  ok: boolean;
  icon: IconName;
}
export interface CtaActivity {
  id: string;
  title: string;
  timestamp: string;
  color: string;
}

const CLIP =
  "polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)";

export function Cta4({
  title,
  accentWord,
  subtitle,
  ctaLabel,
  ctaHref,
  secondaryLabel,
  secondaryHref,
  metrics,
  activitiesTitle,
  activities,
}: {
  title: string;
  accentWord: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  metrics: CtaMetric[];
  activitiesTitle: string;
  activities: CtaActivity[];
}) {
  return (
    <section className="w-full bg-paper py-16">
      <div className="group relative isolate mx-auto flex h-auto min-h-[400px] max-w-[370px] items-center justify-center overflow-hidden rounded-3xl border border-rule bg-teal/5 px-4 pt-12 sm:max-w-2xl sm:px-6 md:max-w-5xl lg:h-[450px] lg:px-8 lg:pt-0">
        <div aria-hidden="true" className="absolute left-[max(-7rem,calc(50%-52rem))] top-1/2 -z-10 -translate-y-1/2 transform-gpu blur-2xl">
          <div style={{ clipPath: CLIP }} className="aspect-577/310 w-xl bg-linear-to-r from-teal to-teal/60 opacity-30" />
        </div>
        <div aria-hidden="true" className="absolute left-[max(45rem,calc(50%+8rem))] top-1/2 -z-10 -translate-y-1/2 transform-gpu blur-2xl">
          <div style={{ clipPath: CLIP }} className="aspect-[577/310] w-[36rem] bg-gradient-to-r from-teal to-teal/60 opacity-30" />
        </div>

        <div className="grid w-full items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
              {title} <span className="text-teal">{accentWord}</span>
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-2 sm:text-base">{subtitle}</p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 lg:justify-start">
              <Link
                href={ctaHref}
                className="inline-flex h-10 items-center justify-center rounded-full bg-teal px-6 text-sm font-semibold text-white no-underline transition-colors hover:bg-[#0e5f75]"
              >
                {ctaLabel}
              </Link>
              <Link href={secondaryHref} className="text-sm font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal">
                {secondaryLabel}
              </Link>
            </div>
          </div>

          <div className="flex translate-y-[10%] justify-center transition-transform duration-500 ease-out group-hover:translate-y-[5%] lg:translate-y-[35%] lg:justify-end lg:group-hover:translate-y-[10%]">
            <div className="relative mx-auto w-full max-w-[320px]" aria-label="This deployment, at a glance" role="group">
              <div className="relative overflow-hidden rounded-[2.5rem] border-[8px] border-abyss bg-paper shadow-2xl">
                <div className="absolute left-1/2 top-2 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-abyss" />

                <div className="no-scrollbar relative h-[480px] overflow-y-auto px-4 pb-8 pt-12">
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                      {metrics.map((m) => (
                        <div key={m.id} className="rounded-2xl border border-rule bg-mint/50 p-3.5 transition-colors hover:bg-mint">
                          <div className="mb-3 flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal/10 text-teal">
                              <Icon name={m.icon} size={14} />
                            </div>
                            <span className="text-xs font-medium text-ink-3">{m.label}</span>
                          </div>
                          <div className="mb-1 truncate text-xl font-bold text-ink">{m.value}</div>
                          <div className={`flex items-center gap-1 text-xs font-semibold ${m.ok ? "text-ok" : "text-warn"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${m.ok ? "bg-ok-mark" : "bg-warn-mark"}`} aria-hidden />
                            <span className="truncate">{m.note}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-ink">{activitiesTitle}</h3>
                        <Link href="/verify" className="text-xs font-medium text-ink-3 no-underline hover:text-ink">
                          Verify
                        </Link>
                      </div>
                      <div className="space-y-3">
                        {activities.map((a) => (
                          <div key={a.id} className="flex items-center justify-between rounded-xl border border-rule bg-paper p-3 shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint">
                                <span className="h-3 w-3 rounded-full" style={{ background: a.color }} aria-hidden />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">{a.title}</p>
                                <p className="text-xs text-ink-3">{a.timestamp}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-2 left-1/2 z-20 h-1 w-24 -translate-x-1/2 rounded-full bg-ink-3/20" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
