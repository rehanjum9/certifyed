import { z } from "zod";

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
export const MAX_FIELD_KEY_LENGTH = 63;
export const MIN_FIELD_SIZE = 10;
/** Caps per-row rendering cost at generation time -- a template can't be made arbitrarily expensive to generate by piling on fields. */
export const MAX_TEMPLATE_FIELDS = 50;

// Email is handled entirely outside template_fields (campaigns.email_column
// / campaign_rows.recipient_email) -- it must never be a renderable field.
export const RESERVED_FIELD_KEYS = new Set(["email"]);

// min_font_size / max_font_size / max_width are genuinely optional --
// meaningful only for certain sizing_mode values (see the refines below).
// `.nullish()` accepts both `null` and `undefined` on input (a field
// created before this column existed, or read back while a PostgREST
// schema cache is briefly stale right after a migration, can come back as
// `undefined` rather than `null`), and `.transform` normalizes either into
// a clean `null` so every consumer downstream only ever sees `number |
// null`, never `undefined`.
const optionalPositiveNumber = z
  .number()
  .positive()
  .nullish()
  .transform((value) => value ?? null);

export const templateFieldInputSchema = z
  .object({
    id: z.string().uuid(),
    field_key: z
      .string()
      .min(1, "Field key is required.")
      .max(MAX_FIELD_KEY_LENGTH, `Field key must be ${MAX_FIELD_KEY_LENGTH} characters or fewer.`)
      .regex(
        FIELD_KEY_PATTERN,
        "Field key must start with a letter and contain only lowercase letters, numbers, and underscores.",
      ),
    label: z.string().min(1, "Label is required.").max(120, "Label must be 120 characters or fewer."),
    x: z.number(),
    y: z.number(),
    width: z.number().min(MIN_FIELD_SIZE, `Width must be at least ${MIN_FIELD_SIZE}.`),
    height: z.number().min(MIN_FIELD_SIZE, `Height must be at least ${MIN_FIELD_SIZE}.`),
    font_family: z.string().min(1, "Font family is required."),
    font_size: z.number().positive("Font size must be positive."),
    font_weight: z.enum(["normal", "bold"]),
    font_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #112233."),
    text_align: z.enum(["left", "center", "right"]),
    sizing_mode: z.enum(["fixed", "auto_width", "fit_text"]),
    min_font_size: optionalPositiveNumber,
    max_font_size: optionalPositiveNumber,
    max_width: optionalPositiveNumber,
    is_required: z.boolean(),
  })
  .refine((field) => !RESERVED_FIELD_KEYS.has(field.field_key), {
    message: '"email" is reserved and cannot be used as a certificate field.',
    path: ["field_key"],
  })
  .refine((field) => field.sizing_mode !== "fit_text" || field.min_font_size != null, {
    message: "Min font size is required for Fit Text mode.",
    path: ["min_font_size"],
  })
  .refine((field) => field.sizing_mode !== "fit_text" || field.max_font_size != null, {
    message: "Max font size is required for Fit Text mode.",
    path: ["max_font_size"],
  })
  .refine(
    (field) =>
      field.sizing_mode !== "fit_text" ||
      field.min_font_size == null ||
      field.max_font_size == null ||
      field.min_font_size <= field.max_font_size,
    {
      message: "Min font size must be less than or equal to max font size.",
      path: ["min_font_size"],
    },
  )
  .refine((field) => field.sizing_mode !== "auto_width" || field.min_font_size != null, {
    message: "Min font size is required for Auto Width mode.",
    path: ["min_font_size"],
  })
  .refine((field) => field.sizing_mode !== "auto_width" || field.max_width != null, {
    message: "Max width is required for Auto Width mode.",
    path: ["max_width"],
  })
  .refine(
    (field) => field.sizing_mode !== "auto_width" || field.max_width == null || field.max_width >= field.width,
    {
      message: "Max width must be at least as wide as the field itself.",
      path: ["max_width"],
    },
  );

export type TemplateFieldInput = z.infer<typeof templateFieldInputSchema>;

/** Body schema for PUT /api/templates/[templateId]/fields -- capped so a template can't be made arbitrarily expensive to generate by piling on fields (see MAX_TEMPLATE_FIELDS). */
export const saveFieldsBodySchema = z.object({
  fields: z
    .array(templateFieldInputSchema)
    .max(MAX_TEMPLATE_FIELDS, `A template may have at most ${MAX_TEMPLATE_FIELDS} fields.`),
});

/**
 * Turns the first Zod issue into a message that names the actual
 * field/property, e.g. "Max width is required for Auto Width mode."
 * instead of the raw "Invalid input: expected number, received
 * undefined." Falls back to prefixing the raw message with its path for
 * any issue that doesn't have a custom `message` (e.g. a genuine type
 * mismatch), so the property responsible is never a mystery.
 */
export function formatValidationIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "This field is invalid.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
