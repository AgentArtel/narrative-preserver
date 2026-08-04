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
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          label: string | null
          last_used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          label?: string | null
          last_used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          label?: string | null
          last_used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      approval_purposes: {
        Row: {
          created_at: string
          description: string | null
          hidden: boolean
          id: string
          label: string
          project_id: string | null
          slug: string
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          hidden?: boolean
          id?: string
          label: string
          project_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          hidden?: boolean
          id?: string
          label?: string
          project_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_purposes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_references: {
        Row: {
          created_at: string
          id: string
          image_url: string
          notes: string | null
          project_id: string
          roles: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          notes?: string | null
          project_id: string
          roles?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          notes?: string | null
          project_id?: string
          roles?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_references_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      beats: {
        Row: {
          created_at: string
          description: string
          id: string
          scene_id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          scene_id: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          scene_id?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beats_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      camera_moves: {
        Row: {
          created_at: string
          description: string | null
          hidden: boolean
          id: string
          implies_motion: boolean
          is_time_move: boolean
          label: string
          project_id: string | null
          slug: string
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          hidden?: boolean
          id?: string
          implies_motion?: boolean
          is_time_move?: boolean
          label: string
          project_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          hidden?: boolean
          id?: string
          implies_motion?: boolean
          is_time_move?: boolean
          label?: string
          project_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "camera_moves_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      canon_records: {
        Row: {
          aspect: string
          created_at: string
          description: string | null
          id: string
          project_id: string
          retired_at: string | null
          retired_reason: string | null
          source_frame_id: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["canon_subject"]
          user_id: string
        }
        Insert: {
          aspect: string
          created_at?: string
          description?: string | null
          id?: string
          project_id: string
          retired_at?: string | null
          retired_reason?: string | null
          source_frame_id?: string | null
          subject_id: string
          subject_type: Database["public"]["Enums"]["canon_subject"]
          user_id: string
        }
        Update: {
          aspect?: string
          created_at?: string
          description?: string | null
          id?: string
          project_id?: string
          retired_at?: string | null
          retired_reason?: string | null
          source_frame_id?: string | null
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["canon_subject"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canon_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_records_source_frame_id_fkey"
            columns: ["source_frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          attributes: Json
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      elements: {
        Row: {
          created_at: string
          description: string | null
          element_type: string | null
          id: string
          name: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          element_type?: string | null
          id?: string
          name: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          element_type?: string | null
          id?: string
          name?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "elements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      frame_approvals: {
        Row: {
          approved_at: string
          approved_by: string | null
          created_at: string
          frame_id: string
          id: string
          note: string | null
          purpose: string
          user_id: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          frame_id: string
          id?: string
          note?: string | null
          purpose?: string
          user_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          frame_id?: string
          id?: string
          note?: string | null
          purpose?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "frame_approvals_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
        ]
      }
      frames: {
        Row: {
          created_at: string
          derived_from_frame_id: string | null
          id: string
          image_url: string
          is_approved: boolean
          is_composite: boolean
          kind: Database["public"]["Enums"]["frame_kind"]
          notes: string | null
          shot_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          derived_from_frame_id?: string | null
          id?: string
          image_url: string
          is_approved?: boolean
          is_composite?: boolean
          kind?: Database["public"]["Enums"]["frame_kind"]
          notes?: string | null
          shot_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          derived_from_frame_id?: string | null
          id?: string
          image_url?: string
          is_approved?: boolean
          is_composite?: boolean
          kind?: Database["public"]["Enums"]["frame_kind"]
          notes?: string | null
          shot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "frames_derived_from_frame_id_fkey"
            columns: ["derived_from_frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frames_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          cost_credits: number | null
          created_at: string
          id: string
          model: string | null
          negative_prompt: string | null
          prompt: string
          provider: string
          reference_summary: Json
          settings: Json
          shot_id: string
          status: Database["public"]["Enums"]["generation_status"]
          tier: string
          tool: string | null
          user_id: string
        }
        Insert: {
          cost_credits?: number | null
          created_at?: string
          id?: string
          model?: string | null
          negative_prompt?: string | null
          prompt: string
          provider?: string
          reference_summary?: Json
          settings?: Json
          shot_id: string
          status?: Database["public"]["Enums"]["generation_status"]
          tier?: string
          tool?: string | null
          user_id: string
        }
        Update: {
          cost_credits?: number | null
          created_at?: string
          id?: string
          model?: string | null
          negative_prompt?: string | null
          prompt?: string
          provider?: string
          reference_summary?: Json
          settings?: Json
          shot_id?: string
          status?: Database["public"]["Enums"]["generation_status"]
          tier?: string
          tool?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generations_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      keyframe_pairs: {
        Row: {
          a_frame_id: string | null
          b_frame_id: string | null
          created_at: string
          form: string | null
          id: string
          notes: string | null
          shot_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          a_frame_id?: string | null
          b_frame_id?: string | null
          created_at?: string
          form?: string | null
          id?: string
          notes?: string | null
          shot_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          a_frame_id?: string | null
          b_frame_id?: string | null
          created_at?: string
          form?: string | null
          id?: string
          notes?: string | null
          shot_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyframe_pairs_a_frame_id_fkey"
            columns: ["a_frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyframe_pairs_b_frame_id_fkey"
            columns: ["b_frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyframe_pairs_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          blocking_anchor: string | null
          created_at: string
          depth_planes: Json
          description: string | null
          id: string
          landmarks: Json
          light_logic: string | null
          master_frame_id: string | null
          materials: string | null
          motion_test_frame_id: string | null
          motion_test_note: string | null
          motion_test_passed_at: string | null
          name: string
          project_id: string
          reverse_frame_id: string | null
          reverse_verification_note: string | null
          reverse_verified_at: string | null
          user_id: string
        }
        Insert: {
          blocking_anchor?: string | null
          created_at?: string
          depth_planes?: Json
          description?: string | null
          id?: string
          landmarks?: Json
          light_logic?: string | null
          master_frame_id?: string | null
          materials?: string | null
          motion_test_frame_id?: string | null
          motion_test_note?: string | null
          motion_test_passed_at?: string | null
          name: string
          project_id: string
          reverse_frame_id?: string | null
          reverse_verification_note?: string | null
          reverse_verified_at?: string | null
          user_id: string
        }
        Update: {
          blocking_anchor?: string | null
          created_at?: string
          depth_planes?: Json
          description?: string | null
          id?: string
          landmarks?: Json
          light_logic?: string | null
          master_frame_id?: string | null
          materials?: string | null
          motion_test_frame_id?: string | null
          motion_test_note?: string | null
          motion_test_passed_at?: string | null
          name?: string
          project_id?: string
          reverse_frame_id?: string | null
          reverse_verification_note?: string | null
          reverse_verified_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_master_frame_id_fkey"
            columns: ["master_frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_motion_test_frame_id_fkey"
            columns: ["motion_test_frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_reverse_frame_id_fkey"
            columns: ["reverse_frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
        ]
      }
      looks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          negative_constraints: string[]
          palette: Json
          project_id: string
          prompt_fragments: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          negative_constraints?: string[]
          palette?: Json
          project_id: string
          prompt_fragments?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          negative_constraints?: string[]
          palette?: Json
          project_id?: string
          prompt_fragments?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "looks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      model_rates: {
        Row: {
          created_at: string
          credits_per_second: number
          description: string | null
          hidden: boolean
          id: string
          label: string
          model: string
          project_id: string | null
          provider: string
          resolution: string
          slug: string
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          credits_per_second: number
          description?: string | null
          hidden?: boolean
          id?: string
          label: string
          model: string
          project_id?: string | null
          provider?: string
          resolution: string
          slug: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          credits_per_second?: number
          description?: string | null
          hidden?: boolean
          id?: string
          label?: string
          model?: string
          project_id?: string | null
          provider?: string
          resolution?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_rates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          code: string | null
          continuity: string | null
          created_at: string
          description: string | null
          direction: string | null
          gate: string
          id: string
          locks_frozen_at: string | null
          status: string
          style_lock: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code?: string | null
          continuity?: string | null
          created_at?: string
          description?: string | null
          direction?: string | null
          gate?: string
          id?: string
          locks_frozen_at?: string | null
          status?: string
          style_lock?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string | null
          continuity?: string | null
          created_at?: string
          description?: string | null
          direction?: string | null
          gate?: string
          id?: string
          locks_frozen_at?: string | null
          status?: string
          style_lock?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      provider_identities: {
        Row: {
          capability: string | null
          created_at: string
          external_id: string
          id: string
          metadata: Json
          owner_id: string
          owner_type: string
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          capability?: string | null
          created_at?: string
          external_id: string
          id?: string
          metadata?: Json
          owner_id: string
          owner_type: string
          provider: string
          status?: string
          user_id: string
        }
        Update: {
          capability?: string | null
          created_at?: string
          external_id?: string
          id?: string
          metadata?: Json
          owner_id?: string
          owner_type?: string
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      reference_links: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          owner_type: string
          reference_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          owner_type: string
          reference_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          owner_type?: string
          reference_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_links_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "asset_references"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_classes: {
        Row: {
          created_at: string
          description: string | null
          guidance: string | null
          hidden: boolean
          id: string
          label: string
          project_id: string | null
          slug: string
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          guidance?: string | null
          hidden?: boolean
          id?: string
          label: string
          project_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          guidance?: string | null
          hidden?: boolean
          id?: string
          label?: string
          project_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_classes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          brief: string | null
          created_at: string
          id: string
          sequence_id: string
          sort_order: number
          status: string
          title: string
          user_id: string
        }
        Insert: {
          brief?: string | null
          created_at?: string
          id?: string
          sequence_id: string
          sort_order?: number
          status?: string
          title: string
          user_id: string
        }
        Update: {
          brief?: string | null
          created_at?: string
          id?: string
          sequence_id?: string
          sort_order?: number
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenes_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          created_at: string
          id: string
          project_id: string
          sort_order: number
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          sort_order?: number
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          sort_order?: number
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_checklist_items: {
        Row: {
          created_at: string
          description: string | null
          hidden: boolean
          id: string
          label: string
          project_id: string | null
          reason: string | null
          slug: string
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          hidden?: boolean
          id?: string
          label: string
          project_id?: string | null
          reason?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          hidden?: boolean
          id?: string
          label?: string
          project_id?: string | null
          reason?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sheet_checklist_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_checks: {
        Row: {
          character_id: string | null
          checked_at: string
          checked_by: string | null
          created_at: string
          frame_id: string
          id: string
          note: string | null
          updated_at: string
          user_id: string
          verdicts: Json
        }
        Insert: {
          character_id?: string | null
          checked_at?: string
          checked_by?: string | null
          created_at?: string
          frame_id: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id: string
          verdicts?: Json
        }
        Update: {
          character_id?: string | null
          checked_at?: string
          checked_by?: string | null
          created_at?: string
          frame_id?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          verdicts?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sheet_checks_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_checks_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: true
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_characters: {
        Row: {
          character_id: string
          id: string
          shot_id: string
          state: Json
          user_id: string
        }
        Insert: {
          character_id: string
          id?: string
          shot_id: string
          state?: Json
          user_id: string
        }
        Update: {
          character_id?: string
          id?: string
          shot_id?: string
          state?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shot_characters_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shot_characters_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_elements: {
        Row: {
          element_id: string
          id: string
          shot_id: string
          state: Json
          user_id: string
        }
        Insert: {
          element_id: string
          id?: string
          shot_id: string
          state?: Json
          user_id: string
        }
        Update: {
          element_id?: string
          id?: string
          shot_id?: string
          state?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shot_elements_element_id_fkey"
            columns: ["element_id"]
            isOneToOne: false
            referencedRelation: "elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shot_elements_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          beat_id: string | null
          camera: Json
          created_at: string
          description: string | null
          dialogue: string | null
          duration_seconds: number | null
          id: string
          location_id: string | null
          location_state: Json
          look_id: string | null
          risk_tail: Json
          scene_id: string
          shot_number: string
          sort_order: number
          status: Database["public"]["Enums"]["shot_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          beat_id?: string | null
          camera?: Json
          created_at?: string
          description?: string | null
          dialogue?: string | null
          duration_seconds?: number | null
          id?: string
          location_id?: string | null
          location_state?: Json
          look_id?: string | null
          risk_tail?: Json
          scene_id: string
          shot_number: string
          sort_order?: number
          status?: Database["public"]["Enums"]["shot_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          beat_id?: string | null
          camera?: Json
          created_at?: string
          description?: string | null
          dialogue?: string | null
          duration_seconds?: number | null
          id?: string
          location_id?: string | null
          location_state?: Json
          look_id?: string | null
          risk_tail?: Json
          scene_id?: string
          shot_number?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["shot_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shots_beat_id_fkey"
            columns: ["beat_id"]
            isOneToOne: false
            referencedRelation: "beats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "looks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_demo_project: { Args: never; Returns: string }
    }
    Enums: {
      canon_subject: "character" | "location" | "element" | "scene" | "shot"
      frame_kind:
        | "concept"
        | "storyboard"
        | "keyframe"
        | "start"
        | "end"
        | "final"
      generation_status: "handed_off" | "imported" | "rejected"
      shot_status:
        | "idea"
        | "drafting"
        | "ready"
        | "generating"
        | "candidates"
        | "revision"
        | "approved"
        | "final"
        | "held_still"
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
    Enums: {
      canon_subject: ["character", "location", "element", "scene", "shot"],
      frame_kind: [
        "concept",
        "storyboard",
        "keyframe",
        "start",
        "end",
        "final",
      ],
      generation_status: ["handed_off", "imported", "rejected"],
      shot_status: [
        "idea",
        "drafting",
        "ready",
        "generating",
        "candidates",
        "revision",
        "approved",
        "final",
        "held_still",
      ],
    },
  },
} as const
