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
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
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
      daily_verses: {
        Row: {
          created_at: string
          date: string
          id: string
          language: string
          reference: string
          text: string
          translation: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          language?: string
          reference: string
          text: string
          translation?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          language?: string
          reference?: string
          text?: string
          translation?: string
          updated_at?: string
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
      glory_reactions: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          testimony_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          testimony_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          testimony_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "glory_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "glory_reactions_testimony_id_fkey"
            columns: ["testimony_id"]
            isOneToOne: false
            referencedRelation: "testimonies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "glory_reactions_testimony_id_fkey"
            columns: ["testimony_id"]
            isOneToOne: false
            referencedRelation: "testimony_feed"
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
      prayer_intercessions: {
        Row: {
          committed_at: string
          created_at: string
          id: string
          next_reminder_at: string | null
          prayed_at: string | null
          prayer_id: string
          profile_id: string
          reminder_count: number
          state: Database["public"]["Enums"]["intercession_state"]
          updated_at: string
        }
        Insert: {
          committed_at?: string
          created_at?: string
          id?: string
          next_reminder_at?: string | null
          prayed_at?: string | null
          prayer_id: string
          profile_id: string
          reminder_count?: number
          state?: Database["public"]["Enums"]["intercession_state"]
          updated_at?: string
        }
        Update: {
          committed_at?: string
          created_at?: string
          id?: string
          next_reminder_at?: string | null
          prayed_at?: string | null
          prayer_id?: string
          profile_id?: string
          reminder_count?: number
          state?: Database["public"]["Enums"]["intercession_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_intercessions_prayer_id_fkey"
            columns: ["prayer_id"]
            isOneToOne: false
            referencedRelation: "prayer_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_intercessions_prayer_id_fkey"
            columns: ["prayer_id"]
            isOneToOne: false
            referencedRelation: "prayers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_intercessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prayers: {
        Row: {
          answered_at: string | null
          author_id: string
          body: string
          branch_id: string
          consent_version: string
          consented_at: string
          created_at: string
          deleted_at: string | null
          id: string
          is_anonymous: boolean
          language: string
          moderated_at: string | null
          moderated_by: string | null
          prayed_count: number
          praying_count: number
          rejection_reason: string | null
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          author_id: string
          body: string
          branch_id: string
          consent_version: string
          consented_at?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_anonymous?: boolean
          language?: string
          moderated_at?: string | null
          moderated_by?: string | null
          prayed_count?: number
          praying_count?: number
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          author_id?: string
          body?: string
          branch_id?: string
          consent_version?: string
          consented_at?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_anonymous?: boolean
          language?: string
          moderated_at?: string | null
          moderated_by?: string | null
          prayed_count?: number
          praying_count?: number
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayers_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayers_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      reports: {
        Row: {
          created_at: string
          id: string
          is_safeguarding: boolean
          prayer_id: string | null
          reason: string
          reporter_id: string | null
          resolution_note: string | null
          status: Database["public"]["Enums"]["report_status"]
          testimony_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_safeguarding?: boolean
          prayer_id?: string | null
          reason: string
          reporter_id?: string | null
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          testimony_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_safeguarding?: boolean
          prayer_id?: string | null
          reason?: string
          reporter_id?: string | null
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          testimony_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_prayer_id_fkey"
            columns: ["prayer_id"]
            isOneToOne: false
            referencedRelation: "prayer_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_prayer_id_fkey"
            columns: ["prayer_id"]
            isOneToOne: false
            referencedRelation: "prayers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_testimony_id_fkey"
            columns: ["testimony_id"]
            isOneToOne: false
            referencedRelation: "testimonies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_testimony_id_fkey"
            columns: ["testimony_id"]
            isOneToOne: false
            referencedRelation: "testimony_feed"
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
          kind: Database["public"]["Enums"]["sermon_kind"]
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
          kind?: Database["public"]["Enums"]["sermon_kind"]
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
          kind?: Database["public"]["Enums"]["sermon_kind"]
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
      testimonies: {
        Row: {
          author_id: string
          body: string
          branch_id: string
          category_id: string | null
          consent_version: string
          consented_at: string
          created_at: string
          deleted_at: string | null
          from_prayer_id: string | null
          glory_count: number
          id: string
          image_url: string | null
          language: string
          moderated_at: string | null
          moderated_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          branch_id: string
          category_id?: string | null
          consent_version: string
          consented_at?: string
          created_at?: string
          deleted_at?: string | null
          from_prayer_id?: string | null
          glory_count?: number
          id?: string
          image_url?: string | null
          language?: string
          moderated_at?: string | null
          moderated_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          branch_id?: string
          category_id?: string | null
          consent_version?: string
          consented_at?: string
          created_at?: string
          deleted_at?: string | null
          from_prayer_id?: string | null
          glory_count?: number
          id?: string
          image_url?: string | null
          language?: string
          moderated_at?: string | null
          moderated_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonies_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "testimony_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonies_from_prayer_id_fkey"
            columns: ["from_prayer_id"]
            isOneToOne: true
            referencedRelation: "prayer_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonies_from_prayer_id_fkey"
            columns: ["from_prayer_id"]
            isOneToOne: true
            referencedRelation: "prayers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonies_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      testimony_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          key: string
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          key: string
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          key?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      prayer_feed: {
        Row: {
          answer_testimony_id: string | null
          answered_at: string | null
          author_avatar_url: string | null
          author_id: string | null
          author_name: string | null
          body: string | null
          branch_id: string | null
          created_at: string | null
          id: string | null
          is_anonymous: boolean | null
          language: string | null
          prayed_count: number | null
          praying_count: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prayers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      testimony_feed: {
        Row: {
          author_avatar_url: string | null
          author_id: string | null
          author_name: string | null
          body: string | null
          branch_id: string | null
          category_id: string | null
          category_key: string | null
          created_at: string | null
          from_prayer_id: string | null
          glory_count: number | null
          id: string | null
          image_url: string | null
          language: string | null
          origin_prayer_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "testimonies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonies_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "testimony_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonies_from_prayer_id_fkey"
            columns: ["from_prayer_id"]
            isOneToOne: true
            referencedRelation: "prayer_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonies_from_prayer_id_fkey"
            columns: ["from_prayer_id"]
            isOneToOne: true
            referencedRelation: "prayers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assert_content_quota: { Args: never; Returns: undefined }
      assert_prayer_link_allowed: {
        Args: { target_prayer: string }
        Returns: undefined
      }
      caller_is_admin_live: { Args: never; Returns: boolean }
      caller_is_onboarded: { Args: never; Returns: boolean }
      caller_profile_is_live: { Args: never; Returns: boolean }
      can_moderate_branch: { Args: { target_branch: string }; Returns: boolean }
      custom_access_token: { Args: { event: Json }; Returns: Json }
      in_counter_write: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_publicly_visible: {
        Args: {
          row_deleted_at: string
          row_status: Database["public"]["Enums"]["content_status"]
        }
        Returns: boolean
      }
      jwt_claim: { Args: { claim: string }; Returns: string }
      jwt_role: { Args: never; Returns: string }
      prayer_has_live_testimony: { Args: { target: string }; Returns: boolean }
      prayer_is_published: { Args: { target: string }; Returns: boolean }
      sync_upsert_sermons: { Args: { rows: Json }; Returns: number }
      testimony_is_published: { Args: { target: string }; Returns: boolean }
    }
    Enums: {
      branch_status: "active" | "archived"
      content_status: "pending" | "approved" | "rejected" | "removed"
      device_platform: "ios" | "android"
      intercession_state: "committed" | "prayed"
      profile_role: "member" | "leader" | "admin"
      report_status: "open" | "actioned" | "dismissed"
      sermon_kind: "video" | "live_replay"
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
      content_status: ["pending", "approved", "rejected", "removed"],
      device_platform: ["ios", "android"],
      intercession_state: ["committed", "prayed"],
      profile_role: ["member", "leader", "admin"],
      report_status: ["open", "actioned", "dismissed"],
      sermon_kind: ["video", "live_replay"],
      sermon_status: ["available", "unavailable"],
      service_kind: ["sunday", "midweek", "classes"],
    },
  },
} as const

