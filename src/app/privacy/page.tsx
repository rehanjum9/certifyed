const EFFECTIVE_DATE = "September 19, 2026";

interface PolicySection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

const SECTIONS: PolicySection[] = [
  {
    id: "information-we-collect",
    title: "1. Information we collect",
    paragraphs: [
      "CERTIFYED_ is a certificate generation and delivery tool used by workspace owners and members. We collect only what the service needs to do that:",
    ],
    bullets: [
      "Account information: your email address, managed through Supabase Authentication, and your role within a workspace (owner or member).",
      "Workspace data: your organization/workspace name and membership.",
      "Certificate templates: SVG files you upload to design certificates.",
      "Recipient data: the CSV/XLSX files you upload, which may include recipient names and email addresses, used to generate and deliver certificates.",
      "Generated certificates: the PDF files produced from your templates and recipient data.",
      "Gmail connection details (only if a workspace owner connects Gmail): the connected Gmail address, and an encrypted credential used solely to send certificate emails from that account.",
      "Basic technical/session data needed to keep you signed in and to protect the service from abuse (e.g. rate limiting).",
    ],
  },
  {
    id: "how-we-use-information",
    title: "2. How we use information",
    paragraphs: [
      "We use the information above only to operate CERTIFYED_: authenticating you, enforcing workspace membership and access control, generating personalized certificate PDFs from your templates and recipient data, and delivering those certificates to the recipients you specify.",
      "We do not sell personal data, and we do not share it with advertisers or use it for advertising. We do not use recipient data for any purpose other than generating and delivering the certificates a workspace requests.",
    ],
  },
  {
    id: "google-gmail-data-usage",
    title: "3. Google / Gmail data usage",
    paragraphs: [
      "A workspace owner may choose to connect a Gmail account so that certificate emails are sent from that workspace's own address. CERTIFYED_ requests only the Gmail \"send\" permission (gmail.send), along with the minimum identity scopes needed to confirm which account was connected. This does not grant access to read, search, or otherwise view the contents of any Gmail inbox — CERTIFYED_ can only send messages, and only the certificate emails a workspace member actually initiates.",
      "The Gmail connection belongs to the workspace that created it. It is never used to send anything other than certificate emails requested through that workspace, and it is never shared with or used on behalf of any other workspace.",
      "A workspace owner can disconnect Gmail at any time from Settings, which immediately removes the stored connection. Members of a workspace can use its already-connected Gmail account to send certificates, but only a workspace owner can connect, reconnect, or disconnect it.",
      "CERTIFYED_'s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
    ],
  },
  {
    id: "data-storage-and-security",
    title: "4. Data storage and security",
    paragraphs: [
      "Application data (accounts, workspaces, templates, campaigns, recipient data, and generated certificates) is stored using Supabase's authentication, database, and file storage services. When deployed, the application itself is hosted on Vercel.",
      "Gmail refresh tokens are encrypted (AES-256-GCM) before they are stored and are decrypted only at the moment a certificate email is sent — they are never exposed to the browser or included in any API response.",
      "Access to a workspace's data is restricted to that workspace's own members, enforced both in the application and at the database level. A platform administrator (who manages workspaces at a deployment level) does not automatically gain access to any workspace's certificate, recipient, or Gmail data.",
    ],
  },
  {
    id: "data-sharing",
    title: "5. Data sharing / service providers",
    paragraphs: [
      "We do not sell personal data. We do not share personal data with advertisers or third parties for marketing purposes.",
      "Data is shared only with the service providers CERTIFYED_ relies on to function, and only to the extent needed:",
    ],
    bullets: [
      "Supabase — authentication, database, and file storage.",
      "Google (Gmail API) — only for a workspace that has connected Gmail, and only to send the certificate emails that workspace requests.",
      "Vercel — application hosting, when deployed.",
    ],
  },
  {
    id: "workspace-and-recipient-data",
    title: "6. Workspace and recipient data",
    paragraphs: [
      "Each workspace's data — templates, campaigns, recipient lists, generated certificates, and its Gmail connection — belongs to that workspace and is never accessible to another workspace.",
      "A workspace owner controls who belongs to their workspace: inviting members, removing members, and transferring ownership. Recipients whose names and email addresses are uploaded for a certificate campaign do not themselves have CERTIFYED_ accounts; their information is used solely to generate and deliver their certificate.",
    ],
  },
  {
    id: "data-deletion",
    title: "7. Data deletion and contact",
    paragraphs: [
      "Disconnecting Gmail removes the stored Gmail connection immediately. Beyond that, workspace and campaign data remains for as long as the corresponding workspace or campaign is kept — we do not promise a fixed retention period, since that depends on how long you keep using them.",
      "If you'd like data deleted or have a question about your information, the fastest path is through the workspace owner who invited you (they control workspace membership) or the administrator who manages the CERTIFYED_ deployment you use. This deployment does not yet have a dedicated privacy contact address configured.",
    ],
  },
  {
    id: "changes-to-this-policy",
    title: "8. Changes to this policy",
    paragraphs: [
      "We may update this policy as CERTIFYED_ changes. If we make material changes, we will reflect that by updating the effective date below.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
        <span className="text-emerald-600">&gt;</span> privacy_policy_
      </h1>

      <p className="mt-3 font-mono text-xs text-slate-400">Effective {EFFECTIVE_DATE}</p>

      <p className="mt-6 text-sm leading-relaxed text-slate-600">
        This policy explains what information CERTIFYED_ collects, how it&apos;s used, and how Google/Gmail data is
        handled when a workspace connects Gmail for certificate delivery. It applies to everyone who uses CERTIFYED_
        — platform administrators, workspace owners, and workspace members.
      </p>

      <div className="mt-12 flex flex-col gap-10">
        {SECTIONS.map((section) => (
          <section key={section.id} className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-0">
            <h2 className="font-mono text-sm font-semibold text-slate-900">
              <span className="text-emerald-600">&gt;</span> {section.title}
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              {section.paragraphs.map((paragraph, index) => (
                <p key={index} className="text-sm leading-relaxed text-slate-600">
                  {paragraph}
                </p>
              ))}
              {section.bullets && (
                <ul className="flex flex-col gap-2">
                  {section.bullets.map((bullet, index) => (
                    <li key={index} className="flex gap-2 text-sm leading-relaxed text-slate-600">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
