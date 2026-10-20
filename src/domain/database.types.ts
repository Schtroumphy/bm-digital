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
      budget_lines: {
        Row: {
          actual: number | null
          block: string
          budget: number
          key: string
          month: string
          name: string
          position: number
          section: string
          user_id: string
        }
        Insert: {
          actual?: number | null
          block: string
          budget?: number
          key: string
          month: string
          name: string
          position: number
          section?: string
          user_id?: string
        }
        Update: {
          actual?: number | null
          block?: string
          budget?: number
          key?: string
          month?: string
          name?: string
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
        Relationships: [
          {
            foreignKeyName: "envelope_allocations_user_id_envelope_id_fkey"
            columns: ["user_id", "envelope_id"]
            isOneToOne: false
            referencedRelation: "envelopes"
            referencedColumns: ["user_id", "id"]
          },
        ]
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
          cash: number
          hue: number
          id: string
          name: string
          position: number
          template_alloc: number
          user_id: string
        }
        Insert: {
          cash?: number
          hue: number
          id: string
          name: string
          position: number
          template_alloc?: number
          user_id?: string
        }
        Update: {
          cash?: number
          hue?: number
          id?: string
          name?: string
          position?: number
          template_alloc?: number
          user_id?: string
        }
        Relationships: []
      }
      months: {
        Row: {
          initialized: boolean
          month: string
          user_id: string
        }
        Insert: {
          initialized?: boolean
          month: string
          user_id?: string
        }
        Update: {
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
          user_id: string
          year: number
        }
        Insert: {
          amount?: number
          envelope_id: string
          id: string
          label: string
          month: number
          user_id?: string
          year: number
        }
        Update: {
          amount?: number
          envelope_id?: string
          id?: string
          label?: string
          month?: number
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          emergency_accounts: string[]
          emergency_target: number
          first_month: string
          invest_target: number
          savings_rate_target: number
          user_id: string
        }
        Insert: {
          emergency_accounts?: string[]
          emergency_target?: number
          first_month: string
          invest_target?: number
          savings_rate_target?: number
          user_id?: string
        }
        Update: {
          emergency_accounts?: string[]
          emergency_target?: number
          first_month?: string
          invest_target?: number
          savings_rate_target?: number
          user_id?: string
        }
        Relationships: []
      }
      template_lines: {
        Row: {
          block: string
          budget: number
          key: string
          name: string
          position: number
          section: string
          user_id: string
        }
        Insert: {
          block: string
          budget?: number
          key: string
          name: string
          position: number
          section?: string
          user_id?: string
        }
        Update: {
          block?: string
          budget?: number
          key?: string
          name?: string
          position?: number
          section?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          day: number
          id: string
          label: string
          month: string
          source: string
          target: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          day: number
          id: string
          label: string
          month: string
          source: string
          target: string
          type: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          day?: number
          id?: string
          label?: string
          month?: string
          source?: string
          target?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          amount?: number
          id: string
          name: string
          position: number
          user_id?: string
        }
        Update: {
          amount?: number
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      transfers_done: {
        Row: {
          month: string
          transfer_id: string
          user_id: string
        }
        Insert: {
          month: string
          transfer_id: string
          user_id?: string
        }
        Update: {
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
