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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_balances: {
        Row: {
          account_id: string
          amount: number
          entered_on: string
          month: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          entered_on: string
          month: string
          user_id?: string
        }
        Update: {
          account_id?: string
          amount?: number
          entered_on?: string
          month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balances_user_id_month_fkey"
            columns: ["user_id", "month"]
            isOneToOne: false
            referencedRelation: "months"
            referencedColumns: ["user_id", "month"]
          },
        ]
      }
      account_movements: {
        Row: {
          amount: number
          bank_date: string | null
          category: string | null
          credit_bank_date: string | null
          credit_fingerprint: string | null
          credit_import_account_id: string | null
          credit_rank: number | null
          day: number
          detail: string | null
          fingerprint: string | null
          from_account_id: string
          id: string
          import_account_id: string | null
          label: string
          month: string
          position: number
          rank: number | null
          target_key: string | null
          target_kind: string | null
          to_account_id: string
          user_id: string
        }
        Insert: {
          amount: number
          bank_date?: string | null
          category?: string | null
          credit_bank_date?: string | null
          credit_fingerprint?: string | null
          credit_import_account_id?: string | null
          credit_rank?: number | null
          day: number
          detail?: string | null
          fingerprint?: string | null
          from_account_id: string
          id: string
          import_account_id?: string | null
          label: string
          month: string
          position?: number
          rank?: number | null
          target_key?: string | null
          target_kind?: string | null
          to_account_id: string
          user_id?: string
        }
        Update: {
          amount?: number
          bank_date?: string | null
          category?: string | null
          credit_bank_date?: string | null
          credit_fingerprint?: string | null
          credit_import_account_id?: string | null
          credit_rank?: number | null
          day?: number
          detail?: string | null
          fingerprint?: string | null
          from_account_id?: string
          id?: string
          import_account_id?: string | null
          label?: string
          month?: string
          position?: number
          rank?: number | null
          target_key?: string | null
          target_kind?: string | null
          to_account_id?: string
          user_id?: string
        }
        Relationships: []
      }
      account_statements: {
        Row: {
          account_key: string
          amount: number
          month: string
          user_id: string
        }
        Insert: {
          account_key: string
          amount: number
          month: string
          user_id?: string
        }
        Update: {
          account_key?: string
          amount?: number
          month?: string
          user_id?: string
        }
        Relationships: []
      }
      adjustments: {
        Row: {
          account_id: string
          amount: number
          cancelled_on: string | null
          created_on: string
          date: string
          id: string
          label: string
          position: number
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          cancelled_on?: string | null
          created_on: string
          date: string
          id: string
          label?: string
          position?: number
          user_id?: string
        }
        Update: {
          account_id?: string
          amount?: number
          cancelled_on?: string | null
          created_on?: string
          date?: string
          id?: string
          label?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          archived: boolean
          envelope_id: string | null
          hue: number
          id: string
          in_budget: boolean
          is_default: boolean
          kind: string | null
          name: string
          opening_balance: number
          opening_confirmed: boolean | null
          opening_month: string
          position: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          envelope_id?: string | null
          hue?: number
          id: string
          in_budget?: boolean
          is_default?: boolean
          kind?: string | null
          name: string
          opening_balance?: number
          opening_confirmed?: boolean | null
          opening_month: string
          position: number
          user_id?: string
        }
        Update: {
          archived?: boolean
          envelope_id?: string | null
          hue?: number
          id?: string
          in_budget?: boolean
          is_default?: boolean
          kind?: string | null
          name?: string
          opening_balance?: number
          opening_confirmed?: boolean | null
          opening_month?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      budget_lines: {
        Row: {
          account_id: string | null
          actual: number | null
          block: string
          budget: number
          due_day: number | null
          exec_mode: string | null
          key: string
          linked_account_id: string | null
          month: string
          name: string
          pay_mode: string | null
          position: number
          section: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          actual?: number | null
          block: string
          budget?: number
          due_day?: number | null
          exec_mode?: string | null
          key: string
          linked_account_id?: string | null
          month: string
          name: string
          pay_mode?: string | null
          position: number
          section?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          actual?: number | null
          block?: string
          budget?: number
          due_day?: number | null
          exec_mode?: string | null
          key?: string
          linked_account_id?: string | null
          month?: string
          name?: string
          pay_mode?: string | null
          position?: number
          section?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_user_id_month_fkey"
            columns: ["user_id", "month"]
            isOneToOne: false
            referencedRelation: "months"
            referencedColumns: ["user_id", "month"]
          },
        ]
      }
      envelope_allocations: {
        Row: {
          amount: number
          envelope_id: string
          month: string
          user_id: string
        }
        Insert: {
          amount: number
          envelope_id: string
          month: string
          user_id?: string
        }
        Update: {
          amount?: number
          envelope_id?: string
          month?: string
          user_id?: string
        }
        Relationships: []
      }
      envelope_history: {
        Row: {
          alloc: number
          balance: number
          envelope_id: string
          month: string
          spent: number
          user_id: string
        }
        Insert: {
          alloc: number
          balance: number
          envelope_id: string
          month: string
          spent: number
          user_id?: string
        }
        Update: {
          alloc?: number
          balance?: number
          envelope_id?: string
          month?: string
          spent?: number
          user_id?: string
        }
        Relationships: []
      }
      envelopes: {
        Row: {
          account_id: string | null
          cash: number
          hue: number
          id: string
          name: string
          position: number
          template_alloc: number | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          cash?: number
          hue: number
          id: string
          name: string
          position: number
          template_alloc?: number | null
          user_id?: string
        }
        Update: {
          account_id?: string | null
          cash?: number
          hue?: number
          id?: string
          name?: string
          position?: number
          template_alloc?: number | null
          user_id?: string
        }
        Relationships: []
      }
      import_account_links: {
        Row: {
          account_id: string | null
          account_name: string
          connection_name: string
          id: string
          position: number
          user_id: string
        }
        Insert: {
          account_id?: string | null
          account_name: string
          connection_name: string
          id: string
          position?: number
          user_id?: string
        }
        Update: {
          account_id?: string | null
          account_name?: string
          connection_name?: string
          id?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      import_rules: {
        Row: {
          id: string
          nature: string
          pattern: string
          position: number
          target_id: string | null
          target_kind: string | null
          user_id: string
        }
        Insert: {
          id: string
          nature: string
          pattern: string
          position?: number
          target_id?: string | null
          target_kind?: string | null
          user_id?: string
        }
        Update: {
          id?: string
          nature?: string
          pattern?: string
          position?: number
          target_id?: string | null
          target_kind?: string | null
          user_id?: string
        }
        Relationships: []
      }
      line_checks: {
        Row: {
          account_id: string | null
          done_on: string
          line_key: string
          month: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          done_on: string
          line_key: string
          month: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          done_on?: string
          line_key?: string
          month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_checks_user_id_month_fkey"
            columns: ["user_id", "month"]
            isOneToOne: false
            referencedRelation: "months"
            referencedColumns: ["user_id", "month"]
          },
        ]
      }
      month_notes: {
        Row: {
          done: boolean
          id: string
          month: string
          position: number
          text: string
          user_id: string
        }
        Insert: {
          done?: boolean
          id: string
          month: string
          position?: number
          text: string
          user_id?: string
        }
        Update: {
          done?: boolean
          id?: string
          month?: string
          position?: number
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "month_notes_user_id_month_fkey"
            columns: ["user_id", "month"]
            isOneToOne: false
            referencedRelation: "months"
            referencedColumns: ["user_id", "month"]
          },
        ]
      }
      months: {
        Row: {
          closed: boolean | null
          initialized: boolean
          month: string
          user_id: string
        }
        Insert: {
          closed?: boolean | null
          initialized?: boolean
          month: string
          user_id?: string
        }
        Update: {
          closed?: boolean | null
          initialized?: boolean
          month?: string
          user_id?: string
        }
        Relationships: []
      }
      planned_items: {
        Row: {
          amount: number
          envelope_id: string
          id: string
          label: string
          month: number
          position: number
          user_id: string
          year: number
        }
        Insert: {
          amount?: number
          envelope_id: string
          id: string
          label: string
          month: number
          position?: number
          user_id?: string
          year: number
        }
        Update: {
          amount?: number
          envelope_id?: string
          id?: string
          label?: string
          month?: number
          position?: number
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          emergency_accounts: string[]
          emergency_due: string | null
          emergency_target: number
          first_month: string | null
          invest_accounts: string[] | null
          invest_due: string | null
          invest_target: number
          pointage_start: string | null
          savings_rate_target: number
          user_id: string
        }
        Insert: {
          emergency_accounts?: string[]
          emergency_due?: string | null
          emergency_target?: number
          first_month?: string | null
          invest_accounts?: string[] | null
          invest_due?: string | null
          invest_target?: number
          pointage_start?: string | null
          savings_rate_target?: number
          user_id?: string
        }
        Update: {
          emergency_accounts?: string[]
          emergency_due?: string | null
          emergency_target?: number
          first_month?: string | null
          invest_accounts?: string[] | null
          invest_due?: string | null
          invest_target?: number
          pointage_start?: string | null
          savings_rate_target?: number
          user_id?: string
        }
        Relationships: []
      }
      template_lines: {
        Row: {
          account_id: string | null
          block: string
          budget: number
          due_day: number | null
          exec_mode: string | null
          key: string
          linked_account_id: string | null
          name: string
          pay_mode: string | null
          position: number
          section: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          block: string
          budget?: number
          due_day?: number | null
          exec_mode?: string | null
          key: string
          linked_account_id?: string | null
          name: string
          pay_mode?: string | null
          position: number
          section?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          block?: string
          budget?: number
          due_day?: number | null
          exec_mode?: string | null
          key?: string
          linked_account_id?: string | null
          name?: string
          pay_mode?: string | null
          position?: number
          section?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          assigned_account_id: string | null
          bank_date: string | null
          category: string | null
          created_at: string
          day: number
          detail: string | null
          fingerprint: string | null
          id: string
          import_account_id: string | null
          label: string
          month: string
          off_budget: boolean | null
          pay_mode: string | null
          position: number
          rank: number | null
          source: string | null
          target: string
          type: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          assigned_account_id?: string | null
          bank_date?: string | null
          category?: string | null
          created_at?: string
          day: number
          detail?: string | null
          fingerprint?: string | null
          id: string
          import_account_id?: string | null
          label: string
          month: string
          off_budget?: boolean | null
          pay_mode?: string | null
          position?: number
          rank?: number | null
          source?: string | null
          target: string
          type: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          assigned_account_id?: string | null
          bank_date?: string | null
          category?: string | null
          created_at?: string
          day?: number
          detail?: string | null
          fingerprint?: string | null
          id?: string
          import_account_id?: string | null
          label?: string
          month?: string
          off_budget?: boolean | null
          pay_mode?: string | null
          position?: number
          rank?: number | null
          source?: string | null
          target?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          from_account_id: string
          id: string
          name: string
          position: number
          to_id: string | null
          to_kind: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          from_account_id?: string
          id: string
          name: string
          position: number
          to_id?: string | null
          to_kind?: string | null
          user_id?: string
        }
        Update: {
          amount?: number
          from_account_id?: string
          id?: string
          name?: string
          position?: number
          to_id?: string | null
          to_kind?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transfers_done: {
        Row: {
          done: boolean
          month: string
          transfer_id: string
          user_id: string
        }
        Insert: {
          done?: boolean
          month: string
          transfer_id: string
          user_id?: string
        }
        Update: {
          done?: boolean
          month?: string
          transfer_id?: string
          user_id?: string
        }
        Relationships: []
      }
      year_closes: {
        Row: {
          closed: boolean
          overrides: Json
          user_id: string
          year: number
        }
        Insert: {
          closed?: boolean
          overrides?: Json
          user_id?: string
          year: number
        }
        Update: {
          closed?: boolean
          overrides?: Json
          user_id?: string
          year?: number
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
  TableName extends keyof DefaultSchema["Tables"],
> = DefaultSchema["Tables"][TableName]["Row"]

export type TablesInsert<
  TableName extends keyof DefaultSchema["Tables"],
> = DefaultSchema["Tables"][TableName]["Insert"]

export type TablesUpdate<
  TableName extends keyof DefaultSchema["Tables"],
> = DefaultSchema["Tables"][TableName]["Update"]
