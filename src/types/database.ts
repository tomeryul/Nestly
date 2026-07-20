export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      dish_ingredients: {
        Row: {
          category: string | null
          dish_id: string
          home_id: string
          id: string
          name: string
          quantity: number
          unit: string | null
        }
        Insert: {
          category?: string | null
          dish_id: string
          home_id: string
          id?: string
          name: string
          quantity?: number
          unit?: string | null
        }
        Update: {
          category?: string | null
          dish_id?: string
          home_id?: string
          id?: string
          name?: string
          quantity?: number
          unit?: string | null
        }
        Relationships: []
      }
      dishes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          home_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          home_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          home_id?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      home_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code: string
          created_at: string
          email: string | null
          expires_at: string
          home_id: string
          id: string
          invited_by: string
          responsibilities: string[]
          role: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          home_id: string
          id?: string
          invited_by: string
          responsibilities?: string[]
          role?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          home_id?: string
          id?: string
          invited_by?: string
          responsibilities?: string[]
          role?: string
        }
        Relationships: []
      }
      home_members: {
        Row: {
          created_at: string
          home_id: string
          id: string
          responsibilities: string[]
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          home_id: string
          id?: string
          responsibilities?: string[]
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          home_id?: string
          id?: string
          responsibilities?: string[]
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      homes: {
        Row: { created_at: string; created_by: string; id: string; name: string }
        Insert: { created_at?: string; created_by: string; id?: string; name: string }
        Update: { created_at?: string; created_by?: string; id?: string; name?: string }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          home_id: string
          id: string
          is_read: boolean
          link: string | null
          push_sent: boolean
          related_id: string | null
          related_table: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          home_id: string
          id?: string
          is_read?: boolean
          link?: string | null
          push_sent?: boolean
          related_id?: string | null
          related_table?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          home_id?: string
          id?: string
          is_read?: boolean
          link?: string | null
          push_sent?: boolean
          related_id?: string | null
          related_table?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: { avatar_url: string | null; created_at: string; display_name: string | null; id: string }
        Insert: { avatar_url?: string | null; created_at?: string; display_name?: string | null; id: string }
        Update: { avatar_url?: string | null; created_at?: string; display_name?: string | null; id?: string }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recurring_shopping_items: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          created_by: string | null
          day_of_week: number
          home_id: string
          id: string
          last_added_on: string | null
          name: string
          quantity: number
          target_list_id: string | null
          unit: string | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          day_of_week: number
          home_id: string
          id?: string
          last_added_on?: string | null
          name: string
          quantity?: number
          target_list_id?: string | null
          unit?: string | null
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          home_id?: string
          id?: string
          last_added_on?: string | null
          name?: string
          quantity?: number
          target_list_id?: string | null
          unit?: string | null
        }
        Relationships: []
      }
      recurring_tasks: {
        Row: {
          active: boolean
          assigned_to: string | null
          category: string
          color: string | null
          created_at: string
          created_by: string | null
          day_of_week: number
          description: string | null
          end_time: string | null
          home_id: string
          id: string
          last_generated_on: string | null
          start_time: string | null
          title: string
        }
        Insert: {
          active?: boolean
          assigned_to?: string | null
          category?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          day_of_week: number
          description?: string | null
          end_time?: string | null
          home_id: string
          id?: string
          last_generated_on?: string | null
          start_time?: string | null
          title: string
        }
        Update: {
          active?: boolean
          assigned_to?: string | null
          category?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          description?: string | null
          end_time?: string | null
          home_id?: string
          id?: string
          last_generated_on?: string | null
          start_time?: string | null
          title?: string
        }
        Relationships: []
      }
      schedule_tasks: {
        Row: {
          assigned_to: string | null
          category: string
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          home_id: string
          id: string
          is_done: boolean
          recurring_id: string | null
          reminded: boolean
          scheduled_date: string
          start_time: string | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          home_id: string
          id?: string
          is_done?: boolean
          recurring_id?: string | null
          reminded?: boolean
          scheduled_date: string
          start_time?: string | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          home_id?: string
          id?: string
          is_done?: boolean
          recurring_id?: string | null
          reminded?: boolean
          scheduled_date?: string
          start_time?: string | null
          title?: string
        }
        Relationships: []
      }
      shopping_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          dish_id: string | null
          home_id: string
          id: string
          is_checked: boolean
          list_id: string
          name: string
          note: string | null
          quantity: number
          source: string
          unit: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          dish_id?: string | null
          home_id: string
          id?: string
          is_checked?: boolean
          list_id: string
          name: string
          note?: string | null
          quantity?: number
          source?: string
          unit?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          dish_id?: string | null
          home_id?: string
          id?: string
          is_checked?: boolean
          list_id?: string
          name?: string
          note?: string | null
          quantity?: number
          source?: string
          unit?: string | null
        }
        Relationships: []
      }
      shopping_lists: {
        Row: {
          created_at: string
          created_by: string | null
          home_id: string
          id: string
          is_default: boolean
          name: string
          week_start: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          home_id: string
          id?: string
          is_default?: boolean
          name: string
          week_start?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          home_id?: string
          id?: string
          is_default?: boolean
          name?: string
          week_start?: string | null
        }
        Relationships: []
      }
      task_subtasks: {
        Row: {
          created_at: string
          home_id: string
          id: string
          is_done: boolean
          position: number
          task_id: string
          title: string
        }
        Insert: {
          created_at?: string
          home_id: string
          id?: string
          is_done?: boolean
          position?: number
          task_id: string
          title: string
        }
        Update: {
          created_at?: string
          home_id?: string
          id?: string
          is_done?: boolean
          position?: number
          task_id?: string
          title?: string
        }
        Relationships: []
      }
      weekly_meals: {
        Row: {
          added_to_list: boolean
          created_at: string
          created_by: string | null
          day_of_week: number | null
          dish_id: string
          home_id: string
          id: string
          meal_type: string | null
          target_list_id: string | null
          week_start: string
        }
        Insert: {
          added_to_list?: boolean
          created_at?: string
          created_by?: string | null
          day_of_week?: number | null
          dish_id: string
          home_id: string
          id?: string
          meal_type?: string | null
          target_list_id?: string | null
          week_start: string
        }
        Update: {
          added_to_list?: boolean
          created_at?: string
          created_by?: string | null
          day_of_week?: number | null
          dish_id?: string
          home_id?: string
          id?: string
          meal_type?: string | null
          target_list_id?: string | null
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      accept_invite: { Args: { invite_code: string }; Returns: string }
      add_meal_to_list: { Args: { list_id: string; meal_id: string }; Returns: undefined }
      create_home: { Args: { home_name: string }; Returns: string }
      invite_preview: {
        Args: { invite_code: string }
        Returns: { home_id: string; home_name: string; valid: boolean }[]
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
