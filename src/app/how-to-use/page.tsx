import Link from "next/link";
import { getSignedInUserEmail } from "@/lib/auth/session";
import { getPrimaryCta } from "@/lib/publicCta";
import { buttonClassName } from "@/components/ui/Button";

const STEPS = [
  {
    number: "01",
    heading: "Prepare your certificate design",
    copy: "Create your certificate design and export it as an SVG file. Keep the parts that stay the same inside the design; recipient-specific information will be added as dynamic fields in CERTIFYED_.",
  },
  {
    number: "02",
    heading: "Create a template",
    copy: "Upload the SVG to CERTIFYED_ and place the dynamic fields on the certificate, such as recipient name, serial number, date, or any other information that changes between recipients.",
  },
  {
    number: "03",
    heading: "Import recipient data",
    copy: "Start a campaign and upload a CSV or Excel file containing your recipient information. Map each spreadsheet column to the matching certificate field.",
    note: "The recipient email is used for delivery and is not printed on the certificate.",
  },
  {
    number: "04",
    heading: "Review and validate",
    copy: "CERTIFYED_ checks the imported data before generation. Review invalid or missing values and preview how recipient information will appear on the certificate.",
  },
  {
    number: "05",
    heading: "Generate certificates",
    copy: "Generate personalized PDF certificates in batches. Each recipient receives their own certificate using the template and mapped data.",
  },
  {
    number: "06",
    heading: "Deliver by email",
    copy: "After generation, send the completed certificates directly to recipient email addresses from the campaign. Failed deliveries can be reviewed and retried.",
  },
];

export const dynamic = "force-dynamic";

export default async function HowToUsePage() {
  const userEmail = await getSignedInUserEmail();
  const primaryCta = getPrimaryCta(userEmail !== null);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
        <span className="text-emerald-600">&gt;</span> how_to_use_
      </h1>

      <p className="mt-4 text-lg text-slate-700">
        CERTIFYED_ takes you from a certificate design to personalized PDF delivery through one structured workflow.
      </p>

      <ol className="mt-12 flex flex-col gap-10">
        {STEPS.map((step) => (
          <li key={step.number} className="flex gap-4 border-t border-slate-200 pt-6 first:border-t-0 first:pt-0">
            <span className="shrink-0 font-mono text-sm font-semibold text-emerald-600">{step.number}</span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">{step.heading}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.copy}</p>
              {step.note && (
                <p className="mt-3 border-l-2 border-emerald-500 pl-3 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Important: </span>
                  {step.note}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-16 flex flex-col items-center gap-4 border-t border-slate-200 pt-12 text-center">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Ready to create a campaign?</h2>
        <Link href={primaryCta.href} className={buttonClassName("primary", "md")}>
          {primaryCta.label}
        </Link>
      </div>
    </div>
  );
}
