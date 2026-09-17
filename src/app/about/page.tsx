import Link from "next/link";
import { IconArrowRight } from "@/components/ui/icons";

const PRINCIPLES = [
  {
    heading: "Your design stays yours",
    copy: "Use an existing SVG certificate design as the base.",
  },
  {
    heading: "Recipient data stays structured",
    copy: "Import CSV or Excel data instead of editing certificates one by one.",
  },
  {
    heading: "Generation and delivery stay together",
    copy: "Manage personalized PDFs and email delivery from the same campaign.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
        <span className="text-emerald-600">&gt;</span> about_certifyed_
      </h1>

      <p className="mt-4 text-lg text-slate-700">
        CERTIFYED_ is a certificate automation tool built to reduce repetitive certificate work.
      </p>

      <p className="mt-4 text-sm leading-relaxed text-slate-600">
        Create a certificate design once, define the fields that change, import recipient data, and generate
        personalized PDF certificates in batches. When the certificates are ready, they can be downloaded or
        delivered directly by email.
      </p>

      <section className="mt-12">
        <h2 className="font-mono text-sm font-semibold text-slate-900">
          <span className="text-emerald-600">&gt;</span> why_it_exists
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Certificate programs often repeat the same process for every recipient: change a name, update a serial
          number, export a file, and send an email. CERTIFYED_ brings those steps into one structured workflow.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <div key={principle.heading}>
              <p className="text-sm font-semibold text-slate-900">{principle.heading}</p>
              <p className="mt-1.5 text-sm text-slate-600">{principle.copy}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-12 border-t border-slate-200 pt-6">
        <Link
          href="/how-to-use"
          className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          How to use CERTIFYED_
          <IconArrowRight className="h-4 w-4" />
        </Link>
      </p>
    </div>
  );
}
