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
      attendance: {
        Row: {
          branch_id: string
          client_taken_at: string
          created_at: string
          id: string
          profile_id: string
          service_date: string
          source: Database["public"]["Enums"]["attendance_source"]
        }
        Insert: {
          branch_id: string
          client_taken_at?: string
          created_at?: string
          id?: string
          profile_id: string
          service_date: string
          source?: Database["public"]["Enums"]["attendance_source"]
        }
        Update: {
          branch_id?: string
          client_taken_at?: string
          created_at?: string
          id?: string
          profile_id?: string
          service_date?: string
          source?: Database["public"]["Enums"]["attendance_source"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_profile_id_fkey"
            columns: ["profile_id"]
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
      bootstrap_admins: {
        Row: {
          created_at: string
          email: string
          note: string
        }
        Insert: {
          created_at?: string
          email: string
          note: string
        }
        Update: {
          created_at?: string
          email?: string
          note?: string
        }
        Relationships: []
      }
      branch_change_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          from_branch_id: string
          id: string
          profile_id: string
          status: Database["public"]["Enums"]["branch_request_status"]
          to_branch_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          from_branch_id: string
          id?: string
          profile_id: string
          status?: Database["public"]["Enums"]["branch_request_status"]
          to_branch_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          from_branch_id?: string
          id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["branch_request_status"]
          to_branch_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_change_requests_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_change_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_change_requests_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
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
      consent_versions: {
        Row: {
          active: boolean
          covers_photos: boolean
          notes: string | null
          published_at: string
          version: string
        }
        Insert: {
          active?: boolean
          covers_photos?: boolean
          notes?: string | null
          published_at?: string
          version: string
        }
        Update: {
          active?: boolean
          covers_photos?: boolean
          notes?: string | null
          published_at?: string
          version?: string
        }
        Relationships: []
      }
      course_fees_regional: {
        Row: {
          country_code: string
          course_id: string
          created_at: string
          currency: string
          fee_minor: number
        }
        Insert: {
          country_code: string
          course_id: string
          created_at?: string
          currency: string
          fee_minor: number
        }
        Update: {
          country_code?: string
          course_id?: string
          created_at?: string
          currency?: string
          fee_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_fees_regional_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_handoff_tokens: {
        Row: {
          course_id: string
          created_at: string
          expires_at: string
          id: string
          profile_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          expires_at: string
          id?: string
          profile_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          profile_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_handoff_tokens_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_handoff_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_interest: {
        Row: {
          course_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_interest_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_interest_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_registrations: {
        Row: {
          amount: number
          branch: string | null
          branch_id: string | null
          city: string
          country: string
          course: string
          course_id: string | null
          created_at: string
          currency: string
          email: string
          format: string
          full_name: string
          id: string
          link_method:
            | Database["public"]["Enums"]["course_registration_link_method"]
            | null
          linked_at: string | null
          linked_by: string | null
          notes: string | null
          payment_status: string
          profile_id: string | null
          source: Database["public"]["Enums"]["course_registration_source"]
          status: Database["public"]["Enums"]["course_registration_status"]
          stripe_session_id: string | null
        }
        Insert: {
          amount: number
          branch?: string | null
          branch_id?: string | null
          city: string
          country: string
          course: string
          course_id?: string | null
          created_at?: string
          currency?: string
          email: string
          format: string
          full_name: string
          id?: string
          link_method?:
            | Database["public"]["Enums"]["course_registration_link_method"]
            | null
          linked_at?: string | null
          linked_by?: string | null
          notes?: string | null
          payment_status?: string
          profile_id?: string | null
          source?: Database["public"]["Enums"]["course_registration_source"]
          status?: Database["public"]["Enums"]["course_registration_status"]
          stripe_session_id?: string | null
        }
        Update: {
          amount?: number
          branch?: string | null
          branch_id?: string | null
          city?: string
          country?: string
          course?: string
          course_id?: string | null
          created_at?: string
          currency?: string
          email?: string
          format?: string
          full_name?: string
          id?: string
          link_method?:
            | Database["public"]["Enums"]["course_registration_link_method"]
            | null
          linked_at?: string | null
          linked_by?: string | null
          notes?: string | null
          payment_status?: string
          profile_id?: string | null
          source?: Database["public"]["Enums"]["course_registration_source"]
          status?: Database["public"]["Enums"]["course_registration_status"]
          stripe_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_registrations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_registrations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_registrations_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_registrations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          fee_currency: string | null
          fee_minor: number | null
          fee_note: Json | null
          formats: Json | null
          gains: Json
          id: string
          level: string
          level_name: string
          name: string
          order: number
          outline: Json
          pathway_summary: Json | null
          prereq_slug: string | null
          slug: string
          step: string
          summary: Json
          upcoming: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee_currency?: string | null
          fee_minor?: number | null
          fee_note?: Json | null
          formats?: Json | null
          gains?: Json
          id?: string
          level: string
          level_name: string
          name: string
          order?: number
          outline?: Json
          pathway_summary?: Json | null
          prereq_slug?: string | null
          slug: string
          step?: string
          summary: Json
          upcoming?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee_currency?: string | null
          fee_minor?: number | null
          fee_note?: Json | null
          formats?: Json | null
          gains?: Json
          id?: string
          level?: string
          level_name?: string
          name?: string
          order?: number
          outline?: Json
          pathway_summary?: Json | null
          prereq_slug?: string | null
          slug?: string
          step?: string
          summary?: Json
          upcoming?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_prereq_slug_fkey"
            columns: ["prereq_slug"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["slug"]
          },
        ]
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
      donations: {
        Row: {
          amount: number
          branch: string | null
          created_at: string
          currency: string
          donor_address: string | null
          donor_name: string | null
          email: string
          frequency: string
          gift_aid_eligible: boolean | null
          giving_type: string | null
          id: string
          payment_status: string
          reference: string | null
          source: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          branch?: string | null
          created_at?: string
          currency: string
          donor_address?: string | null
          donor_name?: string | null
          email: string
          frequency: string
          gift_aid_eligible?: boolean | null
          giving_type?: string | null
          id?: string
          payment_status?: string
          reference?: string | null
          source?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          branch?: string | null
          created_at?: string
          currency?: string
          donor_address?: string | null
          donor_name?: string | null
          email?: string
          frequency?: string
          gift_aid_eligible?: boolean | null
          giving_type?: string | null
          id?: string
          payment_status?: string
          reference?: string | null
          source?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          branch_id: string | null
          created_at: string
          description: string
          ends_at_local: string | null
          id: string
          image_url: string | null
          location: string
          rsvp_enabled: boolean
          source: string
          starts_at_local: string
          status: Database["public"]["Enums"]["event_status"]
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          description?: string
          ends_at_local?: string | null
          id?: string
          image_url?: string | null
          location?: string
          rsvp_enabled?: boolean
          source?: string
          starts_at_local: string
          status?: Database["public"]["Enums"]["event_status"]
          timezone: string
          title: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          description?: string
          ends_at_local?: string | null
          id?: string
          image_url?: string | null
          location?: string
          rsvp_enabled?: boolean
          source?: string
          starts_at_local?: string
          status?: Database["public"]["Enums"]["event_status"]
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
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
      job_alerts: {
        Row: {
          id: string
          kind: string
          recipient_id: string
          sent_at: string
          subject: string
        }
        Insert: {
          id?: string
          kind: string
          recipient_id: string
          sent_at?: string
          subject: string
        }
        Update: {
          id?: string
          kind?: string
          recipient_id?: string
          sent_at?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_alerts_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_leases: {
        Row: {
          job: string
          leased_until: string
        }
        Insert: {
          job: string
          leased_until: string
        }
        Update: {
          job?: string
          leased_until?: string
        }
        Relationships: []
      }
      milestones: {
        Row: {
          achieved_at: string
          id: string
          kind: string
          profile_id: string
        }
        Insert: {
          achieved_at?: string
          id?: string
          kind: string
          profile_id: string
        }
        Update: {
          achieved_at?: string
          id?: string
          kind?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_profile_id_fkey"
            columns: ["profile_id"]
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
      notifications: {
        Row: {
          body: string | null
          broadcast_id: string | null
          created_at: string
          dedupe_key: string | null
          deep_link: string
          id: string
          params: Json | null
          profile_id: string
          read_at: string | null
          template_key: string | null
          title: string | null
          type: string
        }
        Insert: {
          body?: string | null
          broadcast_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          deep_link: string
          id?: string
          params?: Json | null
          profile_id: string
          read_at?: string | null
          template_key?: string | null
          title?: string | null
          type: string
        }
        Update: {
          body?: string | null
          broadcast_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          deep_link?: string
          id?: string
          params?: Json | null
          profile_id?: string
          read_at?: string | null
          template_key?: string | null
          title?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
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
          moderation_note: string | null
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
          moderation_note?: string | null
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
          moderation_note?: string | null
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
            foreignKeyName: "prayers_consent_version_fkey"
            columns: ["consent_version"]
            isOneToOne: false
            referencedRelation: "consent_versions"
            referencedColumns: ["version"]
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
      privileged_actions: {
        Row: {
          action: Database["public"]["Enums"]["privileged_action"]
          actor_id: string | null
          after: Json | null
          before: Json | null
          id: number
          note: string | null
          occurred_at: string
          request_id: string | null
          target_id: string | null
          target_redacted_at: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["privileged_action"]
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          note?: string | null
          occurred_at?: string
          request_id?: string | null
          target_id?: string | null
          target_redacted_at?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["privileged_action"]
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          id?: never
          note?: string | null
          occurred_at?: string
          request_id?: string | null
          target_id?: string | null
          target_redacted_at?: string | null
        }
        Relationships: []
      }
      profile_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          profile_id: string
          verified_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          profile_id: string
          verified_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          profile_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_emails_profile_id_fkey"
            columns: ["profile_id"]
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
      push_tickets: {
        Row: {
          device_id: string
          error: string | null
          processed_at: string | null
          sent_at: string
          ticket_id: string
        }
        Insert: {
          device_id: string
          error?: string | null
          processed_at?: string | null
          sent_at?: string
          ticket_id: string
        }
        Update: {
          device_id?: string
          error?: string | null
          processed_at?: string | null
          sent_at?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tickets_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
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
      rsvps: {
        Row: {
          created_at: string
          event_id: string
          id: string
          profile_id: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          profile_id: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          profile_id?: string
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
          profile_id?: string
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
          artwork_path: string | null
          audio_path: string | null
          branch_id: string | null
          created_at: string
          duration_sec: number | null
          id: string
          kind: Database["public"]["Enums"]["sermon_kind"]
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
          artwork_path?: string | null
          audio_path?: string | null
          branch_id?: string | null
          created_at?: string
          duration_sec?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["sermon_kind"]
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
          artwork_path?: string | null
          audio_path?: string | null
          branch_id?: string | null
          created_at?: string
          duration_sec?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["sermon_kind"]
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
      streaks: {
        Row: {
          current_weeks: number
          last_service_date: string | null
          longest_weeks: number
          profile_id: string
          updated_at: string
        }
        Insert: {
          current_weeks?: number
          last_service_date?: string | null
          longest_weeks?: number
          profile_id: string
          updated_at?: string
        }
        Update: {
          current_weeks?: number
          last_service_date?: string | null
          longest_weeks?: number
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "streaks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
          image_path: string | null
          language: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
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
          image_path?: string | null
          language?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
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
          image_path?: string | null
          language?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
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
            foreignKeyName: "testimonies_consent_version_fkey"
            columns: ["consent_version"]
            isOneToOne: false
            referencedRelation: "consent_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "testimonies_from_prayer_id_fkey"
            columns: ["from_prayer_id"]
            isOneToOne: false
            referencedRelation: "prayer_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonies_from_prayer_id_fkey"
            columns: ["from_prayer_id"]
            isOneToOne: false
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
      testimony_photo_validations: {
        Row: {
          byte_size: number
          content_type: string
          object_id: string
          object_name: string
          object_version: string | null
          validated_at: string
        }
        Insert: {
          byte_size: number
          content_type: string
          object_id: string
          object_name: string
          object_version?: string | null
          validated_at?: string
        }
        Update: {
          byte_size?: number
          content_type?: string
          object_id?: string
          object_name?: string
          object_version?: string | null
          validated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      blocked_members: {
        Row: {
          blocked_id: string | null
          display_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_request_queue: {
        Row: {
          created_at: string | null
          decided_at: string | null
          display_name: string | null
          from_branch_id: string | null
          from_branch_name: string | null
          id: string | null
          status: Database["public"]["Enums"]["branch_request_status"] | null
          to_branch_id: string | null
          to_branch_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_change_requests_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_change_requests_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_queue: {
        Row: {
          author_id: string | null
          body: string | null
          branch_id: string | null
          consent_version: string | null
          created_at: string | null
          id: string | null
          image_path: string | null
          is_anonymous: boolean | null
          is_answered_prayer: boolean | null
          kind: string | null
          language: string | null
          status: Database["public"]["Enums"]["content_status"] | null
          updated_at: string | null
        }
        Relationships: []
      }
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
          is_mine: boolean | null
          language: string | null
          my_answer_testimony_status:
            | Database["public"]["Enums"]["content_status"]
            | null
          my_intercession_state:
            | Database["public"]["Enums"]["intercession_state"]
            | null
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
          image_path: string | null
          is_mine: boolean | null
          language: string | null
          origin_prayer_id: string | null
          reacted_by_me: boolean | null
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
            isOneToOne: false
            referencedRelation: "prayer_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonies_from_prayer_id_fkey"
            columns: ["from_prayer_id"]
            isOneToOne: false
            referencedRelation: "prayers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assert_consent_covers_photo: {
        Args: { target_version: string }
        Returns: undefined
      }
      assert_consent_version_active: {
        Args: { target: string }
        Returns: undefined
      }
      assert_content_quota: { Args: never; Returns: undefined }
      assert_event_accepts_rsvps: {
        Args: { target_event: string }
        Returns: undefined
      }
      assert_photo_path_owned: { Args: { target: string }; Returns: undefined }
      assert_photo_validated: { Args: { target: string }; Returns: undefined }
      assert_prayer_link_allowed: {
        Args: { target_prayer: string }
        Returns: undefined
      }
      assert_sermon_artwork_exists: {
        Args: { target: string }
        Returns: undefined
      }
      assert_sermon_audio_exists: {
        Args: { target: string }
        Returns: undefined
      }
      attendance_service_date: {
        Args: { basis: string; zone: string }
        Returns: string
      }
      award_milestone: {
        Args: { milestone_kind: string; target: string }
        Returns: undefined
      }
      caller_branch_live: { Args: never; Returns: string }
      caller_is_admin_live: { Args: never; Returns: boolean }
      caller_is_onboarded: { Args: never; Returns: boolean }
      caller_profile_is_live: { Args: never; Returns: boolean }
      caller_role_live: { Args: never; Returns: string }
      can_moderate_branch: { Args: { target_branch: string }; Returns: boolean }
      can_read_testimony_photo: {
        Args: { object_name: string }
        Returns: boolean
      }
      claim_job_lease: {
        Args: { job_name: string; lease?: string }
        Returns: boolean
      }
      current_audit_request: { Args: never; Returns: string }
      custom_access_token: { Args: { event: Json }; Returns: Json }
      daily_verse_depth: {
        Args: never
        Returns: {
          days_queued: number
          language: string
          runs_out_on: string
          stale_from: string
        }[]
      }
      decide_branch_request: {
        Args: { approve: boolean; note?: string; request: string }
        Returns: undefined
      }
      deliver_notifications: {
        Args: { entries: Json }
        Returns: {
          deep_link: string
          device_id: string
          expo_push_token: string
          language: string
          notification_id: string
          params: Json
          profile_id: string
          template_key: string
          type: string
        }[]
      }
      email_belongs_to_caller: { Args: { target: string }; Returns: boolean }
      event_start_instant: {
        Args: { starts_at_local: string; tz: string }
        Returns: string
      }
      import_daily_verses: {
        Args: { batch: Json; dry_run?: boolean; replace_existing?: boolean }
        Returns: Json
      }
      in_audit_maintenance: { Args: never; Returns: boolean }
      in_bootstrap_promote: { Args: never; Returns: boolean }
      in_counter_write: { Args: never; Returns: boolean }
      in_privileged_profile_write: { Args: never; Returns: boolean }
      is_publicly_visible: {
        Args: {
          row_deleted_at: string
          row_status: Database["public"]["Enums"]["content_status"]
        }
        Returns: boolean
      }
      jwt_claim: { Args: { claim: string }; Returns: string }
      jwt_role: { Args: never; Returns: string }
      mark_push_tickets_processed: { Args: { results: Json }; Returns: number }
      mint_course_handoff: {
        Args: { p_course_slug: string; p_profile: string }
        Returns: {
          expires_at: string
          outcome: string
          token: string
        }[]
      }
      moderation_alert_batch: {
        Args: { overdue_after?: string }
        Returns: {
          branch_id: string
          branch_name: string
          is_safeguarding: boolean
          item_kind: string
          kind: string
          recipient_email: string
          recipient_id: string
          recipient_name: string
          recipient_role: Database["public"]["Enums"]["profile_role"]
          subject: string
          waiting_since: string
        }[]
      }
      prayer_has_live_testimony: { Args: { target: string }; Returns: boolean }
      prayer_is_published: { Args: { target: string }; Returns: boolean }
      prune_job_alerts: { Args: never; Returns: number }
      purge_old_notifications: {
        Args: { batch_size?: number; older_than?: string }
        Returns: number
      }
      push_error_rate: {
        Args: { window_hours?: number }
        Returns: {
          error_ratio: number
          errored: number
          sent: number
        }[]
      }
      recompute_all_streaks: { Args: never; Returns: number }
      recompute_streak: { Args: { target: string }; Returns: undefined }
      record_attendance: {
        Args: { p_branch_id: string; p_client_taken_at?: string }
        Returns: {
          checked_in: boolean
          current_weeks: number
          last_service_date: string
          longest_weeks: number
          recorded: boolean
          state: string
          today: string
        }[]
      }
      record_job_alerts: { Args: { alerts: Json }; Returns: number }
      record_photo_validation: {
        Args: { content_type: string; object_name: string }
        Returns: undefined
      }
      redeem_course_handoff: {
        Args: { p_consume?: boolean; p_course_slug: string; p_token: string }
        Returns: {
          email: string
          full_name: string
          outcome: string
          profile_id: string
        }[]
      }
      release_job_lease: { Args: { job_name: string }; Returns: undefined }
      rhythm_gathering_rungs: { Args: { total: number }; Returns: number[] }
      rhythm_state: {
        Args: { p_branch_id?: string }
        Returns: {
          checked_in: boolean
          current_weeks: number
          last_service_date: string
          longest_weeks: number
          state: string
          today: string
        }[]
      }
      rhythm_week: { Args: { service_date: string }; Returns: string }
      rhythm_week_rungs: { Args: { weeks: number }; Returns: number[] }
      service_reminder_batch: {
        Args: { at_time?: string; lead_minutes?: number; tick_minutes?: number }
        Returns: {
          branch_id: string
          branch_name: string
          dedupe_key: string
          profile_id: string
          service_date: string
          start_time: string
        }[]
      }
      set_member_role: {
        Args: {
          new_branch?: string
          new_role: Database["public"]["Enums"]["profile_role"]
          target: string
        }
        Returns: undefined
      }
      sync_upsert_sermons: { Args: { rows: Json }; Returns: number }
      testimony_is_published: { Args: { target: string }; Returns: boolean }
      try_iso_date: { Args: { raw: string }; Returns: string }
      verse_alert_batch: {
        Args: { floor_days?: number }
        Returns: {
          days_queued: number
          language: string
          recipient_email: string
          recipient_id: string
          recipient_name: string
          runs_out_on: string
          stale_from: string
          subject: string
        }[]
      }
    }
    Enums: {
      attendance_source: "here_button" | "live_watch"
      branch_request_status: "pending" | "approved" | "rejected" | "cancelled"
      branch_status: "active" | "archived"
      content_status: "pending" | "approved" | "rejected" | "removed"
      course_registration_link_method:
        | "handoff"
        | "email_auto"
        | "self"
        | "leader"
      course_registration_source: "app" | "website" | "import"
      course_registration_status: "pending" | "confirmed" | "cancelled"
      device_platform: "ios" | "android"
      event_status: "scheduled" | "cancelled"
      intercession_state: "committed" | "prayed"
      privileged_action:
        | "role_changed"
        | "branch_changed"
        | "branch_request_rejected"
        | "registration_linked"
      profile_role: "member" | "leader" | "admin"
      report_status: "open" | "actioned" | "dismissed"
      rsvp_status: "going" | "interested" | "cancelled"
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
      attendance_source: ["here_button", "live_watch"],
      branch_request_status: ["pending", "approved", "rejected", "cancelled"],
      branch_status: ["active", "archived"],
      content_status: ["pending", "approved", "rejected", "removed"],
      course_registration_link_method: [
        "handoff",
        "email_auto",
        "self",
        "leader",
      ],
      course_registration_source: ["app", "website", "import"],
      course_registration_status: ["pending", "confirmed", "cancelled"],
      device_platform: ["ios", "android"],
      event_status: ["scheduled", "cancelled"],
      intercession_state: ["committed", "prayed"],
      privileged_action: [
        "role_changed",
        "branch_changed",
        "branch_request_rejected",
        "registration_linked",
      ],
      profile_role: ["member", "leader", "admin"],
      report_status: ["open", "actioned", "dismissed"],
      rsvp_status: ["going", "interested", "cancelled"],
      sermon_kind: ["video", "live_replay"],
      sermon_status: ["available", "unavailable"],
      service_kind: ["sunday", "midweek", "classes"],
    },
  },
} as const

