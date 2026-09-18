// Hand-written to match supabase/migrations/0001_init.sql.
// Once a live Supabase project exists, this can be regenerated with:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type TemplateStatus = "draft" | "published";
export type TextAlign = "left" | "center" | "right";
export type FieldSizingMode = "fixed" | "auto_width" | "fit_text";
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
export type FontFormat = "ttf" | "otf";
export type OrganizationRole = "owner" | "admin" | "member";
export type EmailConnectionProvider = "gmail";

export interface Database {
  public: {
    Tables: {
      templates: {
        Row: {
          id: string;
          organization_id: string;
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
          organization_id: string;
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
          sizing_mode: FieldSizingMode;
          max_width: number | null;
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
          sizing_mode?: FieldSizingMode;
          max_width?: number | null;
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
          organization_id: string;
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
          organization_id: string;
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
          email_attempts: number;
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
          email_attempts?: number;
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
      fonts: {
        Row: {
          id: string;
          organization_id: string;
          display_name: string;
          original_filename: string;
          storage_path: string;
          format: FontFormat;
          font_weight: string;
          file_size: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          display_name: string;
          original_filename: string;
          storage_path: string;
          format: FontFormat;
          font_weight?: string;
          file_size: number;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["fonts"]["Insert"]>;
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
        };
        Update: Partial<Database["public"]["Tables"]["organization_members"]["Insert"]>;
        Relationships: [];
      };
      platform_admins: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["platform_admins"]["Insert"]>;
        Relationships: [];
      };
      organization_invites: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: OrganizationRole;
          invited_by: string;
          accepted_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role: OrganizationRole;
          invited_by: string;
          accepted_at?: string | null;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["organization_invites"]["Insert"]>;
        Relationships: [];
      };
      email_connections: {
        Row: {
          id: string;
          organization_id: string;
          provider: EmailConnectionProvider;
          sender_email: string;
          encrypted_refresh_token: string;
          connected_by: string | null;
          connected_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          provider?: EmailConnectionProvider;
          sender_email: string;
          encrypted_refresh_token: string;
          connected_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["email_connections"]["Insert"]>;
        Relationships: [];
      };
      gmail_oauth_states: {
        Row: {
          id: string;
          state_token_hash: string;
          organization_id: string;
          user_id: string;
          created_at: string;
          expires_at: string;
          consumed_at: string | null;
        };
        Insert: {
          id?: string;
          state_token_hash: string;
          organization_id: string;
          user_id: string;
          expires_at: string;
          consumed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["gmail_oauth_states"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_rate_limit: {
        Args: { p_bucket_key: string; p_window_start: string };
        Returns: number;
      };
      cleanup_rate_limits: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
  };
}
