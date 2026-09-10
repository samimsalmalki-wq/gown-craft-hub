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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: string | null
          id: string
          order_id: string | null
          stage_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          order_id?: string | null
          stage_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          order_id?: string | null
          stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "order_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      alterations: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          notes: string | null
          number: number
          order_id: string
          requested_at: string
          stage_id: string | null
          status: Database["public"]["Enums"]["alteration_status"]
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          notes?: string | null
          number: number
          order_id: string
          requested_at?: string
          stage_id?: string | null
          status?: Database["public"]["Enums"]["alteration_status"]
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          notes?: string | null
          number?: number
          order_id?: string
          requested_at?: string
          stage_id?: string | null
          status?: Database["public"]["Enums"]["alteration_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alterations_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alterations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alterations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alterations_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "order_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          kind: string
          message: string
          order_id: string | null
          stage_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          kind: string
          message: string
          order_id?: string | null
          stage_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          message?: string
          order_id?: string | null
          stage_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "order_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      order_files: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          order_id: string
          stage_id: string | null
          storage_path: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          order_id: string
          stage_id?: string | null
          storage_path: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          order_id?: string
          stage_id?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_files_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "order_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      order_stages: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assignee_id: string | null
          assignee_name: string | null
          completed_at: string | null
          delay_reason: string | null
          due_at: string | null
          duration_minutes: number | null
          id: string
          notes: string | null
          order_id: string
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          requires_review: boolean
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rework_count: number
          stage: string
          started_at: string | null
          status: Database["public"]["Enums"]["stage_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assignee_id?: string | null
          assignee_name?: string | null
          completed_at?: string | null
          delay_reason?: string | null
          due_at?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          order_id: string
          position: number
          priority?: Database["public"]["Enums"]["task_priority"]
          requires_review?: boolean
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rework_count?: number
          stage: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assignee_id?: string | null
          assignee_name?: string | null
          completed_at?: string | null
          delay_reason?: string | null
          due_at?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          order_id?: string
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          requires_review?: boolean
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rework_count?: number
          stage?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_stages_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_stages_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_stages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_stages_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          booked_at: string
          client_contact: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          created_by: string | null
          current_stage: string
          deposit_amount: number
          due_date: string | null
          event_date: string | null
          fitting1_date: string | null
          fitting2_date: string | null
          id: string
          materials: string | null
          measurements: Json
          notes: string | null
          order_no: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          state: Database["public"]["Enums"]["order_state"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          booked_at?: string
          client_contact?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string
          deposit_amount?: number
          due_date?: string | null
          event_date?: string | null
          fitting1_date?: string | null
          fitting2_date?: string | null
          id?: string
          materials?: string | null
          measurements?: Json
          notes?: string | null
          order_no?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          state?: Database["public"]["Enums"]["order_state"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          booked_at?: string
          client_contact?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string
          deposit_amount?: number
          due_date?: string | null
          event_date?: string | null
          fitting1_date?: string | null
          fitting2_date?: string | null
          id?: string
          materials?: string | null
          measurements?: Json
          notes?: string | null
          order_no?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          state?: Database["public"]["Enums"]["order_state"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          allowed_stages: string[]
          avatar_url: string | null
          created_at: string
          department_id: string | null
          full_name: string
          id: string
          is_active: boolean
          job_title: string | null
          phone: string | null
        }
        Insert: {
          allowed_stages?: string[]
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          job_title?: string | null
          phone?: string | null
        }
        Update: {
          allowed_stages?: string[]
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          job_title?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_templates: {
        Row: {
          created_at: string
          expected_days: number
          id: string
          is_active: boolean
          label: string
          position: number
          requires_review: boolean
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_days?: number
          id?: string
          is_active?: boolean
          label: string
          position: number
          requires_review?: boolean
          stage: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_days?: number
          id?: string
          is_active?: boolean
          label?: string
          position?: number
          requires_review?: boolean
          stage?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          id?: string
          permission: string
          user_id: string
        }
        Update: {
          id?: string
          permission?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_stage_template: {
        Args: {
          p_expected_days?: number
          p_label: string
          p_requires_review?: boolean
        }
        Returns: {
          created_at: string
          expected_days: number
          id: string
          is_active: boolean
          label: string
          position: number
          requires_review: boolean
          stage: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stage_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reorder_stage_templates: { Args: { p_ids: string[] }; Returns: undefined }
    }
    Enums: {
      alteration_status: "requested" | "in_progress" | "done" | "cancelled"
      app_role: "admin" | "staff" | "supervisor" | "cs"
      order_state: "active" | "delivered" | "cancelled"
      payment_status: "unpaid" | "partial" | "paid"
      stage_key:
        | "booking"
        | "measurements"
        | "design"
        | "design_approval"
        | "materials"
        | "cutting"
        | "sewing"
        | "embroidery"
        | "finishing"
        | "fitting1"
        | "alterations"
        | "fitting2"
        | "final_alterations"
        | "quality"
        | "prep_delivery"
        | "delivery"
      stage_status:
        | "pending"
        | "in_progress"
        | "done"
        | "blocked"
        | "assigned"
        | "review"
        | "late"
      task_priority: "low" | "normal" | "high" | "urgent"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alteration_status: ["requested", "in_progress", "done", "cancelled"],
      app_role: ["admin", "staff", "supervisor", "cs"],
      order_state: ["active", "delivered", "cancelled"],
      payment_status: ["unpaid", "partial", "paid"],
      stage_key: [
        "booking",
        "measurements",
        "design",
        "design_approval",
        "materials",
        "cutting",
        "sewing",
        "embroidery",
        "finishing",
        "fitting1",
        "alterations",
        "fitting2",
        "final_alterations",
        "quality",
        "prep_delivery",
        "delivery",
      ],
      stage_status: [
        "pending",
        "in_progress",
        "done",
        "blocked",
        "assigned",
        "review",
        "late",
      ],
      task_priority: ["low", "normal", "high", "urgent"],
    },
  },
} as const
