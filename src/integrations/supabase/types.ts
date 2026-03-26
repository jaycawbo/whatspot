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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      constellation_validations: {
        Row: {
          anonymous_id: string
          confidence_delta: number
          constellation_id: string
          created_at: string
          id: string
          user_id: string | null
          validation_type: string
          venue_id: string
        }
        Insert: {
          anonymous_id: string
          confidence_delta?: number
          constellation_id: string
          created_at?: string
          id?: string
          user_id?: string | null
          validation_type: string
          venue_id: string
        }
        Update: {
          anonymous_id?: string
          confidence_delta?: number
          constellation_id?: string
          created_at?: string
          id?: string
          user_id?: string | null
          validation_type?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "constellation_validations_constellation_id_fkey"
            columns: ["constellation_id"]
            isOneToOne: false
            referencedRelation: "constellations"
            referencedColumns: ["id"]
          },
        ]
      }
      constellations: {
        Row: {
          city: string
          created_at: string
          created_by_user_id: string | null
          credibility_score: number
          description: string | null
          id: string
          is_public: boolean
          is_visible: boolean
          name: string
          neighborhood: string | null
          source: string
          status: string
          tag_vector: Json | null
          type: string
          updated_at: string
          validation_count: number
          venue_ids: string[]
        }
        Insert: {
          city: string
          created_at?: string
          created_by_user_id?: string | null
          credibility_score?: number
          description?: string | null
          id?: string
          is_public?: boolean
          is_visible?: boolean
          name: string
          neighborhood?: string | null
          source: string
          status?: string
          tag_vector?: Json | null
          type: string
          updated_at?: string
          validation_count?: number
          venue_ids?: string[]
        }
        Update: {
          city?: string
          created_at?: string
          created_by_user_id?: string | null
          credibility_score?: number
          description?: string | null
          id?: string
          is_public?: boolean
          is_visible?: boolean
          name?: string
          neighborhood?: string | null
          source?: string
          status?: string
          tag_vector?: Json | null
          type?: string
          updated_at?: string
          validation_count?: number
          venue_ids?: string[]
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string | null
          id: string
          labels: string[] | null
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          labels?: string[] | null
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          labels?: string[] | null
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      search_history: {
        Row: {
          created_at: string | null
          id: string
          query_text: string
          results: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          query_text: string
          results?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          query_text?: string
          results?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      skip_history: {
        Row: {
          created_at: string
          id: string
          interaction_type: string
          previous_interaction_type: string | null
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interaction_type: string
          previous_interaction_type?: string | null
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interaction_type?: string
          previous_interaction_type?: string | null
          user_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          anonymous_id: string
          created_at: string
          day_of_week: number | null
          event_type: string
          id: string
          metadata: Json | null
          neighborhood_context: string | null
          position_in_results: number | null
          results_returned: number | null
          search_query: string | null
          session_id: string
          time_of_day_hour: number | null
          user_id: string | null
          venue_id: string | null
        }
        Insert: {
          anonymous_id: string
          created_at?: string
          day_of_week?: number | null
          event_type: string
          id?: string
          metadata?: Json | null
          neighborhood_context?: string | null
          position_in_results?: number | null
          results_returned?: number | null
          search_query?: string | null
          session_id: string
          time_of_day_hour?: number | null
          user_id?: string | null
          venue_id?: string | null
        }
        Update: {
          anonymous_id?: string
          created_at?: string
          day_of_week?: number | null
          event_type?: string
          id?: string
          metadata?: Json | null
          neighborhood_context?: string | null
          position_in_results?: number | null
          results_returned?: number | null
          search_query?: string | null
          session_id?: string
          time_of_day_hour?: number | null
          user_id?: string | null
          venue_id?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string | null
          discovery_anchor_index: number
          discovery_last_criteria_pass: number
          discovery_last_radius_km: number
          display_name: string | null
          id: string
          location: string | null
          preferences: Json | null
          spots_is_public: boolean | null
          spots_share_token: string | null
        }
        Insert: {
          created_at?: string | null
          discovery_anchor_index?: number
          discovery_last_criteria_pass?: number
          discovery_last_radius_km?: number
          display_name?: string | null
          id: string
          location?: string | null
          preferences?: Json | null
          spots_is_public?: boolean | null
          spots_share_token?: string | null
        }
        Update: {
          created_at?: string | null
          discovery_anchor_index?: number
          discovery_last_criteria_pass?: number
          discovery_last_radius_km?: number
          display_name?: string | null
          id?: string
          location?: string | null
          preferences?: Json | null
          spots_is_public?: boolean | null
          spots_share_token?: string | null
        }
        Relationships: []
      }
      user_venue_interactions: {
        Row: {
          anonymous_id: string
          created_at: string
          id: string
          interaction_type: string
          rating: string | null
          updated_at: string
          user_id: string | null
          venue_id: string
        }
        Insert: {
          anonymous_id: string
          created_at?: string
          id?: string
          interaction_type: string
          rating?: string | null
          updated_at?: string
          user_id?: string | null
          venue_id: string
        }
        Update: {
          anonymous_id?: string
          created_at?: string
          id?: string
          interaction_type?: string
          rating?: string | null
          updated_at?: string
          user_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_uvi_venue"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["google_place_id"]
          },
        ]
      }
      venue_signals: {
        Row: {
          avg_result_position_at_save: number | null
          constellation_ids: string[] | null
          disliked_count: number
          dismiss_count: number
          interested_count: number
          last_signal_at: string | null
          liked_count: number
          loved_count: number
          not_interested_count: number
          peak_day_of_week: number | null
          peak_hour: number | null
          save_count: number
          save_rate: number | null
          search_surface_count: number
          top_neighborhoods_saved_from: Json | null
          top_query_contexts: Json | null
          updated_at: string
          venue_id: string
          view_count: number
        }
        Insert: {
          avg_result_position_at_save?: number | null
          constellation_ids?: string[] | null
          disliked_count?: number
          dismiss_count?: number
          interested_count?: number
          last_signal_at?: string | null
          liked_count?: number
          loved_count?: number
          not_interested_count?: number
          peak_day_of_week?: number | null
          peak_hour?: number | null
          save_count?: number
          save_rate?: number | null
          search_surface_count?: number
          top_neighborhoods_saved_from?: Json | null
          top_query_contexts?: Json | null
          updated_at?: string
          venue_id: string
          view_count?: number
        }
        Update: {
          avg_result_position_at_save?: number | null
          constellation_ids?: string[] | null
          disliked_count?: number
          dismiss_count?: number
          interested_count?: number
          last_signal_at?: string | null
          liked_count?: number
          loved_count?: number
          not_interested_count?: number
          peak_day_of_week?: number | null
          peak_hour?: number | null
          save_count?: number
          save_rate?: number | null
          search_surface_count?: number
          top_neighborhoods_saved_from?: Json | null
          top_query_contexts?: Json | null
          updated_at?: string
          venue_id?: string
          view_count?: number
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string | null
          category: string | null
          google_place_id: string
          id: string
          last_fetched: string | null
          lat: number | null
          lng: number | null
          name: string
          photo_url: string | null
          price_level: number | null
          rating: number | null
          review_count: number | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          google_place_id: string
          id?: string
          last_fetched?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          photo_url?: string | null
          price_level?: number | null
          rating?: number | null
          review_count?: number | null
        }
        Update: {
          address?: string | null
          category?: string | null
          google_place_id?: string
          id?: string
          last_fetched?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          photo_url?: string | null
          price_level?: number | null
          rating?: number | null
          review_count?: number | null
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
