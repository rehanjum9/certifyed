import Link from "next/link";
import { getSignedInUserEmail } from "@/lib/auth/session";
import { getPrimaryCta } from "@/lib/publicCta";
import { buttonClassName } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { IconArrowRight } from "@/components/ui/icons";

// Auth-aware CTA only -- everything else on this page is static copy/demo
// content. Never queries campaigns/templates/jobs or any private data.
export const dynamic = "force-dynamic";

const HOW_IT_WORKS_STEPS = [
  {
    number: "01",
    heading: "Upload your design",
    copy: "Upload an SVG certificate template and position the fields that should change for each recipient.",
  },
  {
    number: "02",
    heading: "Import recipient data",
    copy: "Upload a CSV or Excel file, map its columns to your certificate fields, and validate the recipient list.",
  },
  {
    number: "03",
    heading: "Generate and deliver",
    copy: "Generate personalized PDF certificates in batches and send them directly to each recipient.",
  },
];

const BENEFITS = [
  {
    heading: "Keep your design",
    copy: "Use your own certificate artwork instead of rebuilding it inside the application.",
  },
  {
    heading: "Bulk personalization",
    copy: "Turn spreadsheet rows into personalized certificates without editing each file manually.",
  },
  {
    heading: "One delivery flow",
    copy: "Generate, review, download, and email certificates from the same campaign.",
  },
];

export default async function HomePage() {
  const userEmail = await getSignedInUserEmail();
  const primaryCta = getPrimaryCta(userEmail !== null);

  return (
    <>
      <section className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 pb-16 pt-20 text-center sm:px-6 lg:px-8">
        <div>
          <p className="font-mono text-sm font-semibold tracking-tight text-slate-900">
            <span className="text-emerald-600">&gt;</span> CERTIFYED_
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500">generate. personalize. deliver.</p>
        </div>

        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Bulk certificates, without the repetitive work.
        </h1>

        <p className="max-w-xl text-base text-slate-600">
          Upload your certificate design, import recipient data, generate personalized PDFs, and deliver them by email
          — from one workflow.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href={primaryCta.href} className={buttonClassName("primary", "md")}>
            {primaryCta.label}
          </Link>
          <a href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            See how it works
          </a>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-mono text-sm font-semibold text-slate-900">
            <span className="text-emerald-600">&gt;</span> how_it_works
          </h2>
          <p className="mt-2 text-lg text-slate-700">From template to delivery in three steps.</p>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <div key={step.number} className="rounded-xl border border-slate-200 bg-white p-6">
                <span className="font-mono text-xs font-semibold text-emerald-600">STEP {step.number}</span>
                <h3 className="mt-3 text-base font-semibold text-slate-900">{step.heading}</h3>
                <p className="mt-2 text-sm text-slate-600">{step.copy}</p>
              </div>
            ))}
          </div>

          <p className="mt-8">
            <Link
              href="/how-to-use"
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              View the full guide
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </p>
        </div>
      </section>

      <section className="border-t border-slate-200">
        <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-mono text-sm font-semibold text-slate-900">
            <span className="text-emerald-600">&gt;</span> built_for_the_workflow
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <div key={benefit.heading}>
                <p className="font-mono text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {benefit.heading}
                </p>
                <p className="mt-2 text-sm text-slate-600">{benefit.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Static demo content only -- never real campaign data. See lib/auth/session.ts + no service-role client on this page. */}
      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <span className="font-mono text-xs font-medium uppercase tracking-wide text-slate-400">Demo workflow</span>
              <Badge variant="success">completed</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-400">Campaign</p>
                <p className="mt-1 truncate text-sm font-medium text-slate-900">Volunteer Program</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Recipients</p>
                <p className="mt-1 font-mono text-sm font-medium text-slate-900">120</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Generated</p>
                <p className="mt-1 font-mono text-sm font-medium text-slate-900">120</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Emails sent</p>
                <p className="mt-1 font-mono text-sm font-medium text-slate-900">118</p>
              </div>
            </div>
            <div className="px-5 pb-5">
              <ProgressBar percent={98} tone="sky" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Ready to simplify certificate delivery?
          </h2>
          <p className="max-w-md text-sm text-slate-600">
            Set up a template once, then use it across an entire recipient list.
          </p>
          <Link href={primaryCta.href} className={buttonClassName("primary", "md")}>
            {primaryCta.label}
          </Link>
        </div>
      </section>
    </>
  );
}
