import { NextResponse } from "next/server";
import { getTemplate } from "@/lib/templates";
import { saveTemplateFields } from "@/lib/templateFields";
import { saveFieldsBodySchema, formatValidationIssue } from "@/lib/validation/templateField";
import { guardApiRoute } from "@/lib/auth/apiGuard";

export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/templates/[templateId]/fields">,
) {
  const guard = await guardApiRoute();
  if ("response" in guard) return guard.response;

  const { templateId } = await params;
  const template = await getTemplate(templateId);

  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = saveFieldsBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: formatValidationIssue(parsed.error) }, { status: 400 });
  }

  const keys = parsed.data.fields.map((field) => field.field_key);
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
  if (duplicate) {
    return NextResponse.json({ error: `Duplicate field key: "${duplicate}".` }, { status: 400 });
  }

  try {
    const fields = await saveTemplateFields(templateId, parsed.data.fields);
    return NextResponse.json({ fields });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save fields." },
      { status: 500 },
    );
  }
}
