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
      branches: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_main: boolean
          is_warehouse: boolean
          name: string
          order_counter: number
          phone: string | null
          position: number
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_main?: boolean
          is_warehouse?: boolean
          name: string
          order_counter?: number
          phone?: string | null
          position?: number
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_main?: boolean
          is_warehouse?: boolean
          name?: string
          order_counter?: number
          phone?: string | null
          position?: number
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cash_accounts: {
        Row: {
          branch_id: string | null
          created_at: string
          gl_code: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["cash_account_kind"]
          name: string
          notes: string | null
          opening_balance: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          gl_code?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["cash_account_kind"]
          name: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          gl_code?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["cash_account_kind"]
          name?: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          direction: Database["public"]["Enums"]["cash_direction"]
          id: string
          occurred_at: string
          source: string
          source_id: string | null
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction: Database["public"]["Enums"]["cash_direction"]
          id?: string
          occurred_at?: string
          source?: string
          source_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction?: Database["public"]["Enums"]["cash_direction"]
          id?: string
          occurred_at?: string
          source?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      expense_categories: {
        Row: {
          created_at: string
          gl_code: string
          id: string
          is_active: boolean
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          gl_code?: string
          id?: string
          is_active?: boolean
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          gl_code?: string
          id?: string
          is_active?: boolean
          name?: string
          position?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string | null
          cash_account_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          expense_no: string
          id: string
          is_taxable: boolean
          material_id: string | null
          material_qty: number | null
          occurred_at: string
          reference: string | null
          supplier_id: string | null
          updated_at: string
          vat_amount: number
        }
        Insert: {
          amount: number
          branch_id?: string | null
          cash_account_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          expense_no: string
          id?: string
          is_taxable?: boolean
          material_id?: string | null
          material_qty?: number | null
          occurred_at?: string
          reference?: string | null
          supplier_id?: string | null
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          amount?: number
          branch_id?: string | null
          cash_account_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          expense_no?: string
          id?: string
          is_taxable?: boolean
          material_id?: string | null
          material_qty?: number | null
          occurred_at?: string
          reference?: string | null
          supplier_id?: string | null
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_accounts: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_group: boolean
          name: string
          parent_id: string | null
          type: Database["public"]["Enums"]["gl_account_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_group?: boolean
          name: string
          parent_id?: string | null
          type: Database["public"]["Enums"]["gl_account_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_group?: boolean
          name?: string
          parent_id?: string | null
          type?: Database["public"]["Enums"]["gl_account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gl_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          position: number
          qty: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          position?: number
          qty?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          qty?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_no: string
          is_taxable: boolean
          issue_date: string
          notes: string | null
          order_id: string | null
          rental_record_id: string | null
          scope: Database["public"]["Enums"]["finance_scope"]
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_no: string
          is_taxable?: boolean
          issue_date?: string
          notes?: string | null
          order_id?: string | null
          rental_record_id?: string | null
          scope?: Database["public"]["Enums"]["finance_scope"]
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_no?: string
          is_taxable?: boolean
          issue_date?: string
          notes?: string | null
          order_id?: string | null
          rental_record_id?: string | null
          scope?: Database["public"]["Enums"]["finance_scope"]
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_rental_record_id_fkey"
            columns: ["rental_record_id"]
            isOneToOne: false
            referencedRelation: "rental_records"
            referencedColumns: ["id"]
          },
        ]
      }
      item_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          position?: number
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          entry_date: string
          entry_no: string
          id: string
          is_reversal: boolean
          memo: string
          reverses_id: string | null
          source: string
          source_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_no: string
          id?: string
          is_reversal?: boolean
          memo: string
          reverses_id?: string | null
          source?: string
          source_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_no?: string
          id?: string
          is_reversal?: boolean
          memo?: string
          reverses_id?: string | null
          source?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          entry_id: string
          id: string
          memo: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          entry_id: string
          id?: string
          memo?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
          memo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      material_movements: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["material_movement_kind"]
          material_id: string
          notes: string | null
          order_id: string | null
          qty: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["material_movement_kind"]
          material_id: string
          notes?: string | null
          order_id?: string | null
          qty: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["material_movement_kind"]
          material_id?: string
          notes?: string | null
          order_id?: string | null
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movements_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      material_stock: {
        Row: {
          branch_id: string
          id: string
          material_id: string
          min_qty: number
          qty_on_hand: number
          qty_reserved: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          id?: string
          material_id: string
          min_qty?: number
          qty_on_hand?: number
          qty_reserved?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          id?: string
          material_id?: string
          min_qty?: number
          qty_on_hand?: number
          qty_reserved?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_stock_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          image_path: string | null
          is_active: boolean
          min_qty: number
          name: string
          notes: string | null
          qty_on_hand: number
          qty_reserved: number
          supplier: string | null
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          min_qty?: number
          name: string
          notes?: string | null
          qty_on_hand?: number
          qty_reserved?: number
          supplier?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          min_qty?: number
          name?: string
          notes?: string | null
          qty_on_hand?: number
          qty_reserved?: number
          supplier?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
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
      order_materials: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          notes: string | null
          order_id: string
          qty_issued: number
          qty_reserved: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          notes?: string | null
          order_id: string
          qty_issued?: number
          qty_reserved?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          order_id?: string
          qty_issued?: number
          qty_reserved?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_materials_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          is_required: boolean
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
          is_required?: boolean
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
          is_required?: boolean
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
          branch_id: string | null
          client_contact: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          created_by: string | null
          current_stage: string
          deposit_amount: number
          due_date: string | null
          embroidery_model: string | null
          event_date: string | null
          fitting1_date: string | null
          fitting2_date: string | null
          id: string
          is_new_model: boolean
          item_type_id: string | null
          materials: string | null
          measurements: Json
          model_no: string | null
          notes: string | null
          order_kind: Database["public"]["Enums"]["order_kind"]
          order_no: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          scope_set_at: string | null
          scope_set_by: string | null
          security_deposit: number
          state: Database["public"]["Enums"]["order_state"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          booked_at?: string
          branch_id?: string | null
          client_contact?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string
          deposit_amount?: number
          due_date?: string | null
          embroidery_model?: string | null
          event_date?: string | null
          fitting1_date?: string | null
          fitting2_date?: string | null
          id?: string
          is_new_model?: boolean
          item_type_id?: string | null
          materials?: string | null
          measurements?: Json
          model_no?: string | null
          notes?: string | null
          order_kind?: Database["public"]["Enums"]["order_kind"]
          order_no?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          scope_set_at?: string | null
          scope_set_by?: string | null
          security_deposit?: number
          state?: Database["public"]["Enums"]["order_state"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          booked_at?: string
          branch_id?: string | null
          client_contact?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string
          deposit_amount?: number
          due_date?: string | null
          embroidery_model?: string | null
          event_date?: string | null
          fitting1_date?: string | null
          fitting2_date?: string | null
          id?: string
          is_new_model?: boolean
          item_type_id?: string | null
          materials?: string | null
          measurements?: Json
          model_no?: string | null
          notes?: string | null
          order_kind?: Database["public"]["Enums"]["order_kind"]
          order_no?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          scope_set_at?: string | null
          scope_set_by?: string | null
          security_deposit?: number
          state?: Database["public"]["Enums"]["order_state"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_item_type_id_fkey"
            columns: ["item_type_id"]
            isOneToOne: false
            referencedRelation: "item_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_scope_set_by_fkey"
            columns: ["scope_set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          branch_id: string | null
          cash_account_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_deposit: boolean
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          order_id: string | null
          paid_at: string
          receipt_no: string
          reference: string | null
          rental_record_id: string | null
          scope: Database["public"]["Enums"]["finance_scope"]
        }
        Insert: {
          amount: number
          branch_id?: string | null
          cash_account_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_deposit?: boolean
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          order_id?: string | null
          paid_at?: string
          receipt_no: string
          reference?: string | null
          rental_record_id?: string | null
          scope?: Database["public"]["Enums"]["finance_scope"]
        }
        Update: {
          amount?: number
          branch_id?: string | null
          cash_account_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_deposit?: boolean
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          order_id?: string | null
          paid_at?: string
          receipt_no?: string
          reference?: string | null
          rental_record_id?: string | null
          scope?: Database["public"]["Enums"]["finance_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_rental_record_id_fkey"
            columns: ["rental_record_id"]
            isOneToOne: false
            referencedRelation: "rental_records"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allowed_stages: string[]
          avatar_url: string | null
          branch_id: string | null
          created_at: string
          department_id: string | null
          full_name: string
          id: string
          is_active: boolean
          job_title: string | null
          phone: string | null
          role_id: string | null
        }
        Insert: {
          allowed_stages?: string[]
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          department_id?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          job_title?: string | null
          phone?: string | null
          role_id?: string | null
        }
        Update: {
          allowed_stages?: string[]
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          department_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          job_title?: string | null
          phone?: string | null
          role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_dresses: {
        Row: {
          branch_id: string | null
          code: string
          color: string | null
          created_at: string
          created_by: string | null
          deposit_amount: number
          id: string
          image_path: string | null
          model_no: string | null
          notes: string | null
          rent_price: number
          size: string | null
          source_order_id: string | null
          status: Database["public"]["Enums"]["rental_dress_status"]
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          code: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number
          id?: string
          image_path?: string | null
          model_no?: string | null
          notes?: string | null
          rent_price?: number
          size?: string | null
          source_order_id?: string | null
          status?: Database["public"]["Enums"]["rental_dress_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          code?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number
          id?: string
          image_path?: string | null
          model_no?: string | null
          notes?: string | null
          rent_price?: number
          size?: string | null
          source_order_id?: string | null
          status?: Database["public"]["Enums"]["rental_dress_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_dresses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_dresses_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_records: {
        Row: {
          amount: number
          branch_id: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          created_by: string | null
          damage_amount: number
          deposit_amount: number
          dress_id: string
          due_date: string
          id: string
          notes: string | null
          order_id: string | null
          out_date: string
          return_condition: string | null
          returned_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          branch_id?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          damage_amount?: number
          deposit_amount?: number
          dress_id: string
          due_date: string
          id?: string
          notes?: string | null
          order_id?: string | null
          out_date?: string
          return_condition?: string | null
          returned_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          damage_amount?: number
          deposit_amount?: number
          dress_id?: string
          due_date?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          out_date?: string
          return_condition?: string | null
          returned_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_records_dress_id_fkey"
            columns: ["dress_id"]
            isOneToOne: false
            referencedRelation: "rental_dresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_builtin: boolean
          key: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          key: string
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          key?: string
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      stage_templates: {
        Row: {
          created_at: string
          expected_days: number
          id: string
          is_active: boolean
          is_scope_gate: boolean
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
          is_scope_gate?: boolean
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
          is_scope_gate?: boolean
          label?: string
          position?: number
          requires_review?: boolean
          stage?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_requests: {
        Row: {
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          from_branch_id: string
          id: string
          material_id: string
          qty: number
          reason: string | null
          status: Database["public"]["Enums"]["stock_request_status"]
          to_branch_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_branch_id: string
          id?: string
          material_id: string
          qty: number
          reason?: string | null
          status?: Database["public"]["Enums"]["stock_request_status"]
          to_branch_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_branch_id?: string
          id?: string
          material_id?: string
          qty?: number
          reason?: string | null
          status?: Database["public"]["Enums"]["stock_request_status"]
          to_branch_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tax_settings: {
        Row: {
          branch_id: string | null
          business_address: string | null
          business_name: string
          id: string
          tax_number: string | null
          updated_at: string
          vat_enabled: boolean
          vat_rate: number
        }
        Insert: {
          branch_id?: string | null
          business_address?: string | null
          business_name?: string
          id?: string
          tax_number?: string | null
          updated_at?: string
          vat_enabled?: boolean
          vat_rate?: number
        }
        Update: {
          branch_id?: string | null
          business_address?: string | null
          business_name?: string
          id?: string
          tax_number?: string | null
          updated_at?: string
          vat_enabled?: boolean
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
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
      whatsapp_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_journal_entry: {
        Args: { _entry_date: string; _lines: Json; _memo: string }
        Returns: string
      }
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
          is_scope_gate: boolean
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
      close_rental_return: {
        Args: {
          p_condition?: string
          p_damage?: number
          p_note?: string
          p_record_id: string
        }
        Returns: undefined
      }
      decide_stock_request: {
        Args: { p_approve: boolean; p_id: string; p_note?: string }
        Returns: undefined
      }
      deliver_rental_order: {
        Args: { p_due_date?: string; p_order_id: string }
        Returns: string
      }
      reorder_stage_templates: { Args: { p_ids: string[] }; Returns: undefined }
      set_order_stage_scope: {
        Args: { p_order_id: string; p_stages: string[] }
        Returns: undefined
      }
      transfer_material: {
        Args: {
          p_from_branch: string
          p_material_id: string
          p_notes?: string
          p_qty: number
          p_to_branch: string
        }
        Returns: undefined
      }
    }
    Enums: {
      alteration_status: "requested" | "in_progress" | "done" | "cancelled"
      app_role: "admin" | "staff" | "supervisor" | "cs"
      cash_account_kind: "cash" | "card" | "bank"
      cash_direction: "in" | "out"
      finance_scope: "order" | "rental"
      gl_account_type:
        | "asset"
        | "liability"
        | "equity"
        | "revenue"
        | "cost"
        | "expense"
      invoice_status: "draft" | "issued" | "cancelled"
      material_movement_kind: "in" | "out" | "reserve" | "release"
      order_kind: "own" | "rental" | "rental_stock"
      order_state: "active" | "delivered" | "cancelled"
      payment_method: "cash" | "card" | "transfer" | "other"
      payment_status: "unpaid" | "partial" | "paid"
      rental_dress_status:
        | "available"
        | "rented"
        | "cleaning"
        | "repair"
        | "retired"
        | "in_production"
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
      stock_request_status: "pending" | "approved" | "rejected"
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
      cash_account_kind: ["cash", "card", "bank"],
      cash_direction: ["in", "out"],
      finance_scope: ["order", "rental"],
      gl_account_type: [
        "asset",
        "liability",
        "equity",
        "revenue",
        "cost",
        "expense",
      ],
      invoice_status: ["draft", "issued", "cancelled"],
      material_movement_kind: ["in", "out", "reserve", "release"],
      order_kind: ["own", "rental", "rental_stock"],
      order_state: ["active", "delivered", "cancelled"],
      payment_method: ["cash", "card", "transfer", "other"],
      payment_status: ["unpaid", "partial", "paid"],
      rental_dress_status: [
        "available",
        "rented",
        "cleaning",
        "repair",
        "retired",
        "in_production",
      ],
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
      stock_request_status: ["pending", "approved", "rejected"],
      task_priority: ["low", "normal", "high", "urgent"],
    },
  },
} as const
