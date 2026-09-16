import { z } from "zod";

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
export const MAX_FIELD_KEY_LENGTH = 63;
export const MIN_FIELD_SIZE = 10;

// Email is handled entirely outside template_fields (campaigns.email_column
// / campaign_rows.recipient_email) -- it must never be a renderable field.
export const RESERVED_FIELD_KEYS = new Set(["email"]);

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
    auto_fit_text: z.boolean(),
    min_font_size: z.number().positive().nullable(),
    max_font_size: z.number().positive().nullable(),
    is_required: z.boolean(),
  })
  .refine((field) => !RESERVED_FIELD_KEYS.has(field.field_key), {
    message: '"email" is reserved and cannot be used as a certificate field.',
    path: ["field_key"],
  })
  .refine(
    (field) =>
      !field.auto_fit_text ||
      (field.min_font_size != null && field.max_font_size != null && field.min_font_size <= field.max_font_size),
    {
      message: "Auto-fit requires a minimum and maximum font size, with minimum ≤ maximum.",
      path: ["auto_fit_text"],
    },
  );

export type TemplateFieldInput = z.infer<typeof templateFieldInputSchema>;
