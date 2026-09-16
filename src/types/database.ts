// Hand-written to match supabase/migrations/0001_init.sql.
// Once a live Supabase project exists, this can be regenerated with:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type TemplateStatus = "draft" | "published";
export type TextAlign = "left" | "center" | "right";
export type CampaignStatus =
  | "draft"
  | "mapped"
  | "previewing"
  | "queued"
  | "processing"
  | "completed"
  | "failed";
export type CampaignRowStatus =
  | "pending"
  | "generating"
  | "generated"
  | "emailing"
  | "sent"
  | "failed";
export type JobType = "generate_pdfs" | "send_emails";
export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface Database {
  public: {
    Tables: {
      templates: {
        Row: {
          id: string;
          name: string;
          svg_path: string;
          svg_width: number;
          svg_height: number;
          status: TemplateStatus;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          svg_path: string;
          svg_width: number;
          svg_height: number;
          status?: TemplateStatus;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["templates"]["Insert"]>;
        Relationships: [];
      };
      template_fields: {
        Row: {
          id: string;
          template_id: string;
          field_key: string;
          label: string;
          x: number;
          y: number;
          width: number;
          height: number;
          font_family: string;
          font_size: number;
          font_weight: string;
          font_color: string;
          text_align: TextAlign;
          auto_fit_text: boolean;
          min_font_size: number | null;
          max_font_size: number | null;
          is_required: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          field_key: string;
          label: string;
          x: number;
          y: number;
          width: number;
          height: number;
          font_family?: string;
          font_size?: number;
          font_weight?: string;
          font_color?: string;
          text_align?: TextAlign;
          auto_fit_text?: boolean;
          min_font_size?: number | null;
          max_font_size?: number | null;
          is_required?: boolean;
          sort_order?: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["template_fields"]["Insert"]
        >;
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          template_id: string;
          name: string;
          status: CampaignStatus;
          source_file_path: string | null;
          source_row_count: number | null;
          column_mapping: Record<string, string>;
          email_column: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          name: string;
          status?: CampaignStatus;
          source_file_path?: string | null;
          source_row_count?: number | null;
          column_mapping?: Record<string, string>;
          email_column?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Insert"]>;
        Relationships: [];
      };
      campaign_rows: {
        Row: {
          id: string;
          campaign_id: string;
          row_index: number;
          data: Record<string, string>;
          recipient_email: string | null;
          status: CampaignRowStatus;
          pdf_path: string | null;
          error_message: string | null;
          email_message_id: string | null;
          emailed_at: string | null;
          public_verify_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          row_index: number;
          data: Record<string, string>;
          recipient_email?: string | null;
          status?: CampaignRowStatus;
          pdf_path?: string | null;
          error_message?: string | null;
          email_message_id?: string | null;
          emailed_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["campaign_rows"]["Insert"]
        >;
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          campaign_id: string;
          job_type: JobType;
          status: JobStatus;
          batch_start: number;
          batch_end: number;
          attempts: number;
          last_error: string | null;
          locked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          job_type: JobType;
          status?: JobStatus;
          batch_start: number;
          batch_end: number;
          attempts?: number;
          last_error?: string | null;
          locked_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
