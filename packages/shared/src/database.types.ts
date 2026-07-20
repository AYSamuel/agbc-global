export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_services: {
        Row: {
          branch_id: string
          created_at: string
          duration_min: number
          id: string
          kind: Database["public"]["Enums"]["service_kind"]
          label: string
          start_time: string
          weekday: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          duration_min?: number
          id?: string
          kind: Database["public"]["Enums"]["service_kind"]
          label?: string
          start_time: string
          weekday: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          duration_min?: number
          id?: string
          kind?: Database["public"]["Enums"]["service_kind"]
          label?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_services_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: Json
          city: string
          country: string
          created_at: string
          email: string
          id: string
          is_hq: boolean
          languages: string
          lat: number
          lead: Json
          leaders: Json
          lng: number
          name: string
          order: number
          quote: string | null
          service_times: Json
          slug: string
          status: Database["public"]["Enums"]["branch_status"]
          timezone: string
          updated_at: string
          welcome: string
          youtube_channel_id: string | null
        }
        Insert: {
          address?: Json
          city: string
          country: string
          created_at?: string
          email?: string
          id?: string
          is_hq?: boolean
          languages?: string
          lat: number
          lead?: Json
          leaders?: Json
          lng: number
          name: string
          order?: number
          quote?: string | null
          service_times?: Json
          slug: string
          status?: Database["public"]["Enums"]["branch_status"]
          timezone: string
          updated_at?: string
          welcome?: string
          youtube_channel_id?: string | null
        }
        Update: {
          address?: Json
          city?: string
          country?: string
          created_at?: string
          email?: string
          id?: string
          is_hq?: boolean
          languages?: string
          lat?: number
          lead?: Json
          leaders?: Json
          lng?: number
          name?: string
          order?: number
          quote?: string | null
          service_times?: Json
          slug?: string
          status?: Database["public"]["Enums"]["branch_status"]
          timezone?: string
          updated_at?: string
          welcome?: string
          youtube_channel_id?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string
          expo_push_token: string
          id: string
          last_seen_at: string
          platform: Database["public"]["Enums"]["device_platform"]
          profile_id: string
        }
        Insert: {
          created_at?: string
          expo_push_token: string
          id?: string
          last_seen_at?: string
          platform: Database["public"]["Enums"]["device_platform"]
          profile_id: string
        }
        Update: {
          created_at?: string
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["device_platform"]
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      giving_config: {
        Row: {
          accounts: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accounts: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accounts?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "giving_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          branch_updates: boolean
          ministry_announcements: boolean
          prayer_activity: boolean
          prayer_reminders: boolean
          profile_id: string
          service_reminders: boolean
          testimony_activity: boolean
          updated_at: string
          whatsapp_opt_in: boolean
        }
        Insert: {
          branch_updates?: boolean
          ministry_announcements?: boolean
          prayer_activity?: boolean
          prayer_reminders?: boolean
          profile_id: string
          service_reminders?: boolean
          testimony_activity?: boolean
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Update: {
          branch_updates?: boolean
          ministry_announcements?: boolean
          prayer_activity?: boolean
          prayer_reminders?: boolean
          profile_id?: string
          service_reminders?: boolean
          testimony_activity?: boolean
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      playback_positions: {
        Row: {
          position_sec: number
          profile_id: string
          sermon_id: string
          updated_at: string
        }
        Insert: {
          position_sec?: number
          profile_id: string
          sermon_id: string
          updated_at?: string
        }
        Update: {
          position_sec?: number
          profile_id?: string
          sermon_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playback_positions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playback_positions_sermon_id_fkey"
            columns: ["sermon_id"]
            isOneToOne: false
            referencedRelation: "sermons"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_confirmed_at: string | null
          avatar_url: string | null
          branch_id: string
          created_at: string
          deleted_at: string | null
          display_name: string
          email: string
          id: string
          language: string
          onboarded_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["profile_role"]
          theme_pref: string
          updated_at: string
        }
        Insert: {
          age_confirmed_at?: string | null
          avatar_url?: string | null
          branch_id: string
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          email: string
          id: string
          language?: string
          onboarded_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          theme_pref?: string
          updated_at?: string
        }
        Update: {
          age_confirmed_at?: string | null
          avatar_url?: string | null
          branch_id?: string
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          email?: string
          id?: string
          language?: string
          onboarded_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          theme_pref?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_items: {
        Row: {
          created_at: string
          profile_id: string
          sermon_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          sermon_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          sermon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_items_sermon_id_fkey"
            columns: ["sermon_id"]
            isOneToOne: false
            referencedRelation: "sermons"
            referencedColumns: ["id"]
          },
        ]
      }
      sermon_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          profile_id: string
          sermon_id: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          profile_id: string
          sermon_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          profile_id?: string
          sermon_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sermon_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sermon_notes_sermon_id_fkey"
            columns: ["sermon_id"]
            isOneToOne: false
            referencedRelation: "sermons"
            referencedColumns: ["id"]
          },
        ]
      }
      sermons: {
        Row: {
          audio_url: string | null
          branch_id: string | null
          created_at: string
          duration_sec: number | null
          id: string
          is_live: boolean
          live_checked_at: string | null
          published_at: string
          series: string | null
          speaker: string
          status: Database["public"]["Enums"]["sermon_status"]
          thumbnail_url: string
          title: string
          updated_at: string
          youtube_id: string | null
        }
        Insert: {
          audio_url?: string | null
          branch_id?: string | null
          created_at?: string
          duration_sec?: number | null
          id?: string
          is_live?: boolean
          live_checked_at?: string | null
          published_at?: string
          series?: string | null
          speaker?: string
          status?: Database["public"]["Enums"]["sermon_status"]
          thumbnail_url?: string
          title: string
          updated_at?: string
          youtube_id?: string | null
        }
        Update: {
          audio_url?: string | null
          branch_id?: string | null
          created_at?: string
          duration_sec?: number | null
          id?: string
          is_live?: boolean
          live_checked_at?: string | null
          published_at?: string
          series?: string | null
          speaker?: string
          status?: Database["public"]["Enums"]["sermon_status"]
          thumbnail_url?: string
          title?: string
          updated_at?: string
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sermons_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      caller_profile_is_live: { Args: never; Returns: boolean }
      custom_access_token: { Args: { event: Json }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      jwt_claim: { Args: { claim: string }; Returns: string }
      jwt_role: { Args: never; Returns: string }
      sync_upsert_sermons: { Args: { rows: Json }; Returns: number }
    }
    Enums: {
      branch_status: "active" | "archived"
      device_platform: "ios" | "android"
      profile_role: "member" | "leader" | "admin"
      sermon_status: "available" | "unavailable"
      service_kind: "sunday" | "midweek" | "classes"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      branch_status: ["active", "archived"],
      device_platform: ["ios", "android"],
      profile_role: ["member", "leader", "admin"],
      sermon_status: ["available", "unavailable"],
      service_kind: ["sunday", "midweek", "classes"],
    },
  },
} as const

