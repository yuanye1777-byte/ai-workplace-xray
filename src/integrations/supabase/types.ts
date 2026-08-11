export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      assessment_turns: {
        Row: {
          anonymous_user_id: string
          answer: string | null
          assessment_id: string
          classified: Json | null
          created_at: string
          id: string
          question: string | null
          target_dimension: string | null
          turn_index: number
        }
        Insert: {
          anonymous_user_id: string
          answer?: string | null
          assessment_id: string
          classified?: Json | null
          created_at?: string
          id?: string
          question?: string | null
          target_dimension?: string | null
          turn_index: number
        }
        Update: {
          anonymous_user_id?: string
          answer?: string | null
          assessment_id?: string
          classified?: Json | null
          created_at?: string
          id?: string
          question?: string | null
          target_dimension?: string | null
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_turns_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          anonymous_user_id: string
          career_context_id: string
          completed_at: string | null
          created_at: string
          id: string
          model_version: string | null
          prompt_version: string | null
          started_at: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          anonymous_user_id: string
          career_context_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          model_version?: string | null
          prompt_version?: string | null
          started_at?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          anonymous_user_id?: string
          career_context_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          model_version?: string | null
          prompt_version?: string | null
          started_at?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_anonymous_user_id_fkey"
            columns: ["anonymous_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["anonymous_user_id"]
          },
          {
            foreignKeyName: "assessments_career_context_id_fkey"
            columns: ["career_context_id"]
            isOneToOne: false
            referencedRelation: "career_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      baseline_snapshots: {
        Row: {
          anonymous_user_id: string
          assessment_id: string
          career_context_id: string
          confidence: number | null
          core_task_state: number | null
          created_at: string
          diagnosis_id: string
          id: string
          information_state: number | null
          issue_type: string | null
          power_state: number | null
          resource_state: number | null
          risk_level: string | null
          snapshot_data: Json
          trust_state: number | null
        }
        Insert: {
          anonymous_user_id: string
          assessment_id: string
          career_context_id: string
          confidence?: number | null
          core_task_state?: number | null
          created_at?: string
          diagnosis_id: string
          id?: string
          information_state?: number | null
          issue_type?: string | null
          power_state?: number | null
          resource_state?: number | null
          risk_level?: string | null
          snapshot_data?: Json
          trust_state?: number | null
        }
        Update: {
          anonymous_user_id?: string
          assessment_id?: string
          career_context_id?: string
          confidence?: number | null
          core_task_state?: number | null
          created_at?: string
          diagnosis_id?: string
          id?: string
          information_state?: number | null
          issue_type?: string | null
          power_state?: number | null
          resource_state?: number | null
          risk_level?: string | null
          snapshot_data?: Json
          trust_state?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "baseline_snapshots_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseline_snapshots_career_context_id_fkey"
            columns: ["career_context_id"]
            isOneToOne: false
            referencedRelation: "career_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseline_snapshots_diagnosis_id_fkey"
            columns: ["diagnosis_id"]
            isOneToOne: false
            referencedRelation: "diagnoses"
            referencedColumns: ["id"]
          },
        ]
      }
      career_contexts: {
        Row: {
          anonymous_user_id: string
          created_at: string
          ended_at: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          anonymous_user_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          anonymous_user_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_contexts_anonymous_user_id_fkey"
            columns: ["anonymous_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["anonymous_user_id"]
          },
        ]
      }
      diagnoses: {
        Row: {
          anonymous_user_id: string
          assessment_id: string
          career_context_id: string
          conclusion: string | null
          confidence: number | null
          created_at: string
          five_dimensions: Json
          id: string
          issue_type: string
          key_facts: Json
          key_signals: Json
          model_version: string | null
          prompt_version: string | null
          report_data: Json | null
          risk_level: string | null
          risk_score: number | null
        }
        Insert: {
          anonymous_user_id: string
          assessment_id: string
          career_context_id: string
          conclusion?: string | null
          confidence?: number | null
          created_at?: string
          five_dimensions?: Json
          id?: string
          issue_type?: string
          key_facts?: Json
          key_signals?: Json
          model_version?: string | null
          prompt_version?: string | null
          report_data?: Json | null
          risk_level?: string | null
          risk_score?: number | null
        }
        Update: {
          anonymous_user_id?: string
          assessment_id?: string
          career_context_id?: string
          conclusion?: string | null
          confidence?: number | null
          created_at?: string
          five_dimensions?: Json
          id?: string
          issue_type?: string
          key_facts?: Json
          key_signals?: Json
          model_version?: string | null
          prompt_version?: string | null
          report_data?: Json | null
          risk_level?: string | null
          risk_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnoses_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnoses_career_context_id_fkey"
            columns: ["career_context_id"]
            isOneToOne: false
            referencedRelation: "career_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          anonymous_user_id: string
          created_at: string
          id: string
          last_active_at: string
          updated_at: string
        }
        Insert: {
          anonymous_user_id: string
          created_at?: string
          id?: string
          last_active_at?: string
          updated_at?: string
        }
        Update: {
          anonymous_user_id?: string
          created_at?: string
          id?: string
          last_active_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
