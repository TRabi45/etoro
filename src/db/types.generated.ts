export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agent_runs: {
        Row: {
          created_at: string
          error_class: string | null
          id: string
          is_stub: boolean
          latency_ms: number | null
          model_name: string | null
          monitoring_run_id: string | null
          prompt_version: string | null
          purpose: string
          status: Database["public"]["Enums"]["run_status"]
          updated_at: string
          usage: Json | null
        }
        Insert: {
          created_at?: string
          error_class?: string | null
          id?: string
          is_stub?: boolean
          latency_ms?: number | null
          model_name?: string | null
          monitoring_run_id?: string | null
          prompt_version?: string | null
          purpose: string
          status?: Database["public"]["Enums"]["run_status"]
          updated_at?: string
          usage?: Json | null
        }
        Update: {
          created_at?: string
          error_class?: string | null
          id?: string
          is_stub?: boolean
          latency_ms?: number | null
          model_name?: string | null
          monitoring_run_id?: string | null
          prompt_version?: string | null
          purpose?: string
          status?: Database["public"]["Enums"]["run_status"]
          updated_at?: string
          usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_monitoring_run_id_fkey"
            columns: ["monitoring_run_id"]
            isOneToOne: false
            referencedRelation: "monitoring_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_claims: {
        Row: {
          assessment_id: string
          claim_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          assessment_id: string
          claim_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          assessment_id?: string
          claim_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_claims_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_claims_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          agent_run_id: string
          company_id: string
          counter_thesis: string | null
          created_at: string
          gap_closed: string | null
          id: string
          path: Database["public"]["Enums"]["target_path"]
          risks: string | null
          route_assessment: Json
          strategic_fit_summary: string | null
          synergies: string | null
          thesis_version: string
          unknowns: string[]
          why_now: string | null
        }
        Insert: {
          agent_run_id: string
          company_id: string
          counter_thesis?: string | null
          created_at?: string
          gap_closed?: string | null
          id?: string
          path: Database["public"]["Enums"]["target_path"]
          risks?: string | null
          route_assessment?: Json
          strategic_fit_summary?: string | null
          synergies?: string | null
          thesis_version: string
          unknowns?: string[]
          why_now?: string | null
        }
        Update: {
          agent_run_id?: string
          company_id?: string
          counter_thesis?: string | null
          created_at?: string
          gap_closed?: string | null
          id?: string
          path?: Database["public"]["Enums"]["target_path"]
          risks?: string | null
          route_assessment?: Json
          strategic_fit_summary?: string | null
          synergies?: string | null
          thesis_version?: string
          unknowns?: string[]
          why_now?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          citations: Json
          content: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["chat_role"]
          session_id: string
          tool_summary: Json | null
        }
        Insert: {
          citations?: Json
          content: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["chat_role"]
          session_id: string
          tool_summary?: Json | null
        }
        Update: {
          citations?: Json
          content?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["chat_role"]
          session_id?: string
          tool_summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string
          current_company_id: string | null
          id: string
          owner_token: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_company_id?: string | null
          id?: string
          owner_token?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_company_id?: string | null
          id?: string
          owner_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_current_company_id_fkey"
            columns: ["current_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_sources: {
        Row: {
          claim_id: string
          created_at: string
          excerpt: string | null
          id: string
          relation: Database["public"]["Enums"]["claim_source_relation"]
          source_id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          excerpt?: string | null
          id?: string
          relation?: Database["public"]["Enums"]["claim_source_relation"]
          source_id: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          excerpt?: string | null
          id?: string
          relation?: Database["public"]["Enums"]["claim_source_relation"]
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_sources_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          agent_run_id: string | null
          ai_confidence: Database["public"]["Enums"]["confidence_level"] | null
          as_of_date: string | null
          claim_kind: Database["public"]["Enums"]["claim_kind"]
          company_id: string | null
          conflict_group: string | null
          created_at: string
          id: string
          predicate: string
          subject: string
          unknown_reason: string | null
          updated_at: string
          value_currency: string | null
          value_numeric: number | null
          value_status: Database["public"]["Enums"]["value_status"]
          value_text: string | null
          value_unit: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          agent_run_id?: string | null
          ai_confidence?: Database["public"]["Enums"]["confidence_level"] | null
          as_of_date?: string | null
          claim_kind: Database["public"]["Enums"]["claim_kind"]
          company_id?: string | null
          conflict_group?: string | null
          created_at?: string
          id?: string
          predicate: string
          subject: string
          unknown_reason?: string | null
          updated_at?: string
          value_currency?: string | null
          value_numeric?: number | null
          value_status?: Database["public"]["Enums"]["value_status"]
          value_text?: string | null
          value_unit?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          agent_run_id?: string | null
          ai_confidence?: Database["public"]["Enums"]["confidence_level"] | null
          as_of_date?: string | null
          claim_kind?: Database["public"]["Enums"]["claim_kind"]
          company_id?: string | null
          conflict_group?: string | null
          created_at?: string
          id?: string
          predicate?: string
          subject?: string
          unknown_reason?: string | null
          updated_at?: string
          value_currency?: string | null
          value_numeric?: number | null
          value_status?: Database["public"]["Enums"]["value_status"]
          value_text?: string | null
          value_unit?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "claims_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          agent_run_id: string | null
          canonical_name: string
          created_at: string
          description: string | null
          discovery_reason: string | null
          enabling_layers: Database["public"]["Enums"]["enabling_layer"][]
          entity_role: Database["public"]["Enums"]["entity_role"]
          hq_country: string | null
          id: string
          incorporation_country: string | null
          last_material_change_at: string | null
          last_researched_at: string | null
          legal_entity_name: string | null
          lifecycle_status: Database["public"]["Enums"]["lifecycle_status"]
          ma_state: Database["public"]["Enums"]["ma_state"] | null
          next_refresh_at: string | null
          parent_company_id: string | null
          path: Database["public"]["Enums"]["target_path"] | null
          primary_domain: string | null
          record_origin: Database["public"]["Enums"]["record_origin"]
          research_state: Database["public"]["Enums"]["research_state"]
          research_tier: Database["public"]["Enums"]["research_tier"]
          research_tier_confidence:
            | Database["public"]["Enums"]["confidence_level"]
            | null
          research_tier_reason: string | null
          screen_reason: string | null
          screened_at: string | null
          slug: string
          theme_tags: Database["public"]["Enums"]["strategic_theme"][]
          tier_changed_by_run_id: string | null
          updated_at: string
        }
        Insert: {
          agent_run_id?: string | null
          canonical_name: string
          created_at?: string
          description?: string | null
          discovery_reason?: string | null
          enabling_layers?: Database["public"]["Enums"]["enabling_layer"][]
          entity_role?: Database["public"]["Enums"]["entity_role"]
          hq_country?: string | null
          id?: string
          incorporation_country?: string | null
          last_material_change_at?: string | null
          last_researched_at?: string | null
          legal_entity_name?: string | null
          lifecycle_status?: Database["public"]["Enums"]["lifecycle_status"]
          ma_state?: Database["public"]["Enums"]["ma_state"] | null
          next_refresh_at?: string | null
          parent_company_id?: string | null
          path?: Database["public"]["Enums"]["target_path"] | null
          primary_domain?: string | null
          record_origin: Database["public"]["Enums"]["record_origin"]
          research_state?: Database["public"]["Enums"]["research_state"]
          research_tier?: Database["public"]["Enums"]["research_tier"]
          research_tier_confidence?:
            | Database["public"]["Enums"]["confidence_level"]
            | null
          research_tier_reason?: string | null
          screen_reason?: string | null
          screened_at?: string | null
          slug: string
          theme_tags?: Database["public"]["Enums"]["strategic_theme"][]
          tier_changed_by_run_id?: string | null
          updated_at?: string
        }
        Update: {
          agent_run_id?: string | null
          canonical_name?: string
          created_at?: string
          description?: string | null
          discovery_reason?: string | null
          enabling_layers?: Database["public"]["Enums"]["enabling_layer"][]
          entity_role?: Database["public"]["Enums"]["entity_role"]
          hq_country?: string | null
          id?: string
          incorporation_country?: string | null
          last_material_change_at?: string | null
          last_researched_at?: string | null
          legal_entity_name?: string | null
          lifecycle_status?: Database["public"]["Enums"]["lifecycle_status"]
          ma_state?: Database["public"]["Enums"]["ma_state"] | null
          next_refresh_at?: string | null
          parent_company_id?: string | null
          path?: Database["public"]["Enums"]["target_path"] | null
          primary_domain?: string | null
          record_origin?: Database["public"]["Enums"]["record_origin"]
          research_state?: Database["public"]["Enums"]["research_state"]
          research_tier?: Database["public"]["Enums"]["research_tier"]
          research_tier_confidence?:
            | Database["public"]["Enums"]["confidence_level"]
            | null
          research_tier_reason?: string | null
          screen_reason?: string | null
          screened_at?: string | null
          slug?: string
          theme_tags?: Database["public"]["Enums"]["strategic_theme"][]
          tier_changed_by_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_tier_changed_by_run_id_fkey"
            columns: ["tier_changed_by_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      company_aliases: {
        Row: {
          agent_run_id: string | null
          alias: string
          alias_kind: Database["public"]["Enums"]["alias_kind"]
          company_id: string
          created_at: string
          id: string
          is_exact_legal_entity: boolean
          notes: string | null
        }
        Insert: {
          agent_run_id?: string | null
          alias: string
          alias_kind: Database["public"]["Enums"]["alias_kind"]
          company_id: string
          created_at?: string
          id?: string
          is_exact_legal_entity?: boolean
          notes?: string | null
        }
        Update: {
          agent_run_id?: string | null
          alias?: string
          alias_kind?: Database["public"]["Enums"]["alias_kind"]
          company_id?: string
          created_at?: string
          id?: string
          is_exact_legal_entity?: boolean
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_aliases_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_aliases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_domains: {
        Row: {
          agent_run_id: string | null
          company_id: string
          created_at: string
          domain: string
          id: string
          is_primary: boolean
        }
        Insert: {
          agent_run_id?: string | null
          company_id: string
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean
        }
        Update: {
          agent_run_id?: string | null
          company_id?: string
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_domains_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_domains_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_metrics: {
        Row: {
          agent_run_id: string | null
          as_of_date: string | null
          claim_id: string | null
          company_id: string
          confidence: Database["public"]["Enums"]["confidence_level"] | null
          created_at: string
          currency: string | null
          id: string
          metric_type: string
          period_end: string | null
          period_start: string | null
          value_numeric: number | null
          value_status: Database["public"]["Enums"]["value_status"]
          value_unit: string | null
        }
        Insert: {
          agent_run_id?: string | null
          as_of_date?: string | null
          claim_id?: string | null
          company_id: string
          confidence?: Database["public"]["Enums"]["confidence_level"] | null
          created_at?: string
          currency?: string | null
          id?: string
          metric_type: string
          period_end?: string | null
          period_start?: string | null
          value_numeric?: number | null
          value_status: Database["public"]["Enums"]["value_status"]
          value_unit?: string | null
        }
        Update: {
          agent_run_id?: string | null
          as_of_date?: string | null
          claim_id?: string | null
          company_id?: string
          confidence?: Database["public"]["Enums"]["confidence_level"] | null
          created_at?: string
          currency?: string | null
          id?: string
          metric_type?: string
          period_end?: string | null
          period_start?: string | null
          value_numeric?: number | null
          value_status?: Database["public"]["Enums"]["value_status"]
          value_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_metrics_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_metrics_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_research_runs: {
        Row: {
          claims_written: number
          company_id: string
          error_summary: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          sources_fetched: number
          sources_planned: number
          started_at: string
          status: Database["public"]["Enums"]["run_status"]
          trigger: Database["public"]["Enums"]["run_trigger"]
          warnings: string[]
        }
        Insert: {
          claims_written?: number
          company_id: string
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          sources_fetched?: number
          sources_planned?: number
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
          trigger: Database["public"]["Enums"]["run_trigger"]
          warnings?: string[]
        }
        Update: {
          claims_written?: number
          company_id?: string
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          sources_fetched?: number
          sources_planned?: number
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
          trigger?: Database["public"]["Enums"]["run_trigger"]
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "company_research_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_search_leads: {
        Row: {
          company_id: string
          created_at: string
          id: string
          label: string
          query: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          label: string
          query?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          label?: string
          query?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_search_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_tier_transitions: {
        Row: {
          agent_run_id: string
          company_id: string
          confidence: Database["public"]["Enums"]["confidence_level"] | null
          created_at: string
          from_tier: Database["public"]["Enums"]["research_tier"] | null
          id: string
          reason: string
          to_tier: Database["public"]["Enums"]["research_tier"]
        }
        Insert: {
          agent_run_id: string
          company_id: string
          confidence?: Database["public"]["Enums"]["confidence_level"] | null
          created_at?: string
          from_tier?: Database["public"]["Enums"]["research_tier"] | null
          id?: string
          reason: string
          to_tier: Database["public"]["Enums"]["research_tier"]
        }
        Update: {
          agent_run_id?: string
          company_id?: string
          confidence?: Database["public"]["Enums"]["confidence_level"] | null
          created_at?: string
          from_tier?: Database["public"]["Enums"]["research_tier"] | null
          id?: string
          reason?: string
          to_tier?: Database["public"]["Enums"]["research_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "company_tier_transitions_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_tier_transitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_status_history: {
        Row: {
          agent_run_id: string | null
          created_at: string
          deal_id: string
          effective_from: string
          id: string
          note: string | null
          source_id: string | null
          status: Database["public"]["Enums"]["deal_status"]
        }
        Insert: {
          agent_run_id?: string | null
          created_at?: string
          deal_id: string
          effective_from: string
          id?: string
          note?: string | null
          source_id?: string | null
          status: Database["public"]["Enums"]["deal_status"]
        }
        Update: {
          agent_run_id?: string | null
          created_at?: string
          deal_id?: string
          effective_from?: string
          id?: string
          note?: string | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "deal_status_history_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_status_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_status_history_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          acquirer_company_id: string | null
          acquirer_name_text: string | null
          agent_run_id: string | null
          announced_date: string | null
          closed_date: string | null
          consideration_amount: number | null
          consideration_currency: string | null
          consideration_status: Database["public"]["Enums"]["value_status"]
          created_at: string
          deal_type: Database["public"]["Enums"]["target_object"] | null
          expected_close_date: string | null
          id: string
          rationale: string | null
          signed_date: string | null
          status: Database["public"]["Enums"]["deal_status"]
          target_company_id: string | null
          target_name_text: string | null
          terminated_date: string | null
          updated_at: string
        }
        Insert: {
          acquirer_company_id?: string | null
          acquirer_name_text?: string | null
          agent_run_id?: string | null
          announced_date?: string | null
          closed_date?: string | null
          consideration_amount?: number | null
          consideration_currency?: string | null
          consideration_status?: Database["public"]["Enums"]["value_status"]
          created_at?: string
          deal_type?: Database["public"]["Enums"]["target_object"] | null
          expected_close_date?: string | null
          id?: string
          rationale?: string | null
          signed_date?: string | null
          status: Database["public"]["Enums"]["deal_status"]
          target_company_id?: string | null
          target_name_text?: string | null
          terminated_date?: string | null
          updated_at?: string
        }
        Update: {
          acquirer_company_id?: string | null
          acquirer_name_text?: string | null
          agent_run_id?: string | null
          announced_date?: string | null
          closed_date?: string | null
          consideration_amount?: number | null
          consideration_currency?: string | null
          consideration_status?: Database["public"]["Enums"]["value_status"]
          created_at?: string
          deal_type?: Database["public"]["Enums"]["target_object"] | null
          expected_close_date?: string | null
          id?: string
          rationale?: string | null
          signed_date?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          target_company_id?: string | null
          target_name_text?: string | null
          terminated_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_acquirer_company_id_fkey"
            columns: ["acquirer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_target_company_id_fkey"
            columns: ["target_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          agent_run_id: string
          company_id: string | null
          created_at: string
          dedupe_key: string | null
          etoro_relevance: string | null
          event_category: Database["public"]["Enums"]["event_category"]
          event_date: string | null
          event_type: Database["public"]["Enums"]["event_type"] | null
          id: string
          materiality: Database["public"]["Enums"]["materiality_level"] | null
          primary_source_id: string | null
          published_at: string | null
          summary: string
        }
        Insert: {
          agent_run_id: string
          company_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          etoro_relevance?: string | null
          event_category: Database["public"]["Enums"]["event_category"]
          event_date?: string | null
          event_type?: Database["public"]["Enums"]["event_type"] | null
          id?: string
          materiality?: Database["public"]["Enums"]["materiality_level"] | null
          primary_source_id?: string | null
          published_at?: string | null
          summary: string
        }
        Update: {
          agent_run_id?: string
          company_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          etoro_relevance?: string | null
          event_category?: Database["public"]["Enums"]["event_category"]
          event_date?: string | null
          event_type?: Database["public"]["Enums"]["event_type"] | null
          id?: string
          materiality?: Database["public"]["Enums"]["materiality_level"] | null
          primary_source_id?: string | null
          published_at?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_primary_source_id_fkey"
            columns: ["primary_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      fundamental_analyses: {
        Row: {
          agent_run_id: string
          archetype: Database["public"]["Enums"]["fundamental_archetype"]
          burn_runway: string | null
          company_id: string
          concentration: string | null
          created_at: string
          derived_ratios: Json
          evidence_coverage: number | null
          growth_assessment: string | null
          id: string
          margin_assessment: string | null
          revenue_quality: string | null
          unknowns: string[]
          version: number
        }
        Insert: {
          agent_run_id: string
          archetype: Database["public"]["Enums"]["fundamental_archetype"]
          burn_runway?: string | null
          company_id: string
          concentration?: string | null
          created_at?: string
          derived_ratios?: Json
          evidence_coverage?: number | null
          growth_assessment?: string | null
          id?: string
          margin_assessment?: string | null
          revenue_quality?: string | null
          unknowns?: string[]
          version: number
        }
        Update: {
          agent_run_id?: string
          archetype?: Database["public"]["Enums"]["fundamental_archetype"]
          burn_runway?: string | null
          company_id?: string
          concentration?: string | null
          created_at?: string
          derived_ratios?: Json
          evidence_coverage?: number | null
          growth_assessment?: string | null
          id?: string
          margin_assessment?: string | null
          revenue_quality?: string | null
          unknowns?: string[]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fundamental_analyses_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundamental_analyses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fundamental_analysis_claims: {
        Row: {
          claim_id: string
          created_at: string
          field: string
          fundamental_analysis_id: string
          id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          field: string
          fundamental_analysis_id: string
          id?: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          field?: string
          fundamental_analysis_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundamental_analysis_claims_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundamental_analysis_claims_fundamental_analysis_id_fkey"
            columns: ["fundamental_analysis_id"]
            isOneToOne: false
            referencedRelation: "fundamental_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_rounds: {
        Row: {
          agent_run_id: string | null
          amount: number | null
          amount_currency: string | null
          amount_status: Database["public"]["Enums"]["value_status"]
          announced_date: string | null
          claim_id: string | null
          company_id: string
          created_at: string
          id: string
          investors: string[]
          round_type: string | null
          valuation: number | null
          valuation_currency: string | null
          valuation_status: Database["public"]["Enums"]["value_status"]
        }
        Insert: {
          agent_run_id?: string | null
          amount?: number | null
          amount_currency?: string | null
          amount_status?: Database["public"]["Enums"]["value_status"]
          announced_date?: string | null
          claim_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          investors?: string[]
          round_type?: string | null
          valuation?: number | null
          valuation_currency?: string | null
          valuation_status?: Database["public"]["Enums"]["value_status"]
        }
        Update: {
          agent_run_id?: string | null
          amount?: number | null
          amount_currency?: string | null
          amount_status?: Database["public"]["Enums"]["value_status"]
          announced_date?: string | null
          claim_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          investors?: string[]
          round_type?: string | null
          valuation?: number | null
          valuation_currency?: string | null
          valuation_status?: Database["public"]["Enums"]["value_status"]
        }
        Relationships: [
          {
            foreignKeyName: "funding_rounds_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_rounds_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_rounds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          agent_run_id: string | null
          claim_id: string | null
          company_id: string
          created_at: string
          id: string
          jurisdiction: string
          legal_entity_name: string
          license_type: string
          reference_number: string | null
          regulator: string
          regulatory_role: Database["public"]["Enums"]["regulatory_role"] | null
          status: Database["public"]["Enums"]["license_status"]
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          agent_run_id?: string | null
          claim_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          jurisdiction: string
          legal_entity_name: string
          license_type: string
          reference_number?: string | null
          regulator: string
          regulatory_role?:
            | Database["public"]["Enums"]["regulatory_role"]
            | null
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          agent_run_id?: string | null
          claim_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          jurisdiction?: string
          legal_entity_name?: string
          license_type?: string
          reference_number?: string | null
          regulator?: string
          regulatory_role?:
            | Database["public"]["Enums"]["regulatory_role"]
            | null
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_runs: {
        Row: {
          claims_written: number
          companies_discovered: number
          created_at: string
          error_summary: string | null
          events_written: number
          finished_at: string | null
          id: string
          idempotency_key: string
          sources_discovered: number
          sources_fetched: number
          sources_skipped: number
          started_at: string
          status: Database["public"]["Enums"]["run_status"]
          trigger: Database["public"]["Enums"]["run_trigger"]
          updated_at: string
          warnings: string[]
        }
        Insert: {
          claims_written?: number
          companies_discovered?: number
          created_at?: string
          error_summary?: string | null
          events_written?: number
          finished_at?: string | null
          id?: string
          idempotency_key: string
          sources_discovered?: number
          sources_fetched?: number
          sources_skipped?: number
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
          trigger: Database["public"]["Enums"]["run_trigger"]
          updated_at?: string
          warnings?: string[]
        }
        Update: {
          claims_written?: number
          companies_discovered?: number
          created_at?: string
          error_summary?: string | null
          events_written?: number
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          sources_discovered?: number
          sources_fetched?: number
          sources_skipped?: number
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
          trigger?: Database["public"]["Enums"]["run_trigger"]
          updated_at?: string
          warnings?: string[]
        }
        Relationships: []
      }
      people: {
        Row: {
          agent_run_id: string | null
          claim_id: string | null
          company_id: string
          created_at: string
          end_date: string | null
          full_name: string
          id: string
          role: string | null
          start_date: string | null
        }
        Insert: {
          agent_run_id?: string | null
          claim_id?: string | null
          company_id: string
          created_at?: string
          end_date?: string | null
          full_name: string
          id?: string
          role?: string | null
          start_date?: string | null
        }
        Update: {
          agent_run_id?: string | null
          claim_id?: string | null
          company_id?: string
          created_at?: string
          end_date?: string | null
          full_name?: string
          id?: string
          role?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          agent_run_id: string | null
          best_route: Database["public"]["Enums"]["scoring_route"] | null
          blocking_gates: string[] | null
          buy_beats_alternatives: boolean | null
          calculated_at: string
          company_id: string
          created_at: string
          evidence_penalty: number | null
          final_score: number | null
          gates: Json | null
          id: string
          input_hash: string
          input_snapshot: Json
          lower_bound: number | null
          model_version: string
          path: Database["public"]["Enums"]["target_path"] | null
          positive_normalized: number | null
          recommendation: Database["public"]["Enums"]["recommendation_state"]
          risk_penalty: number | null
          score_state: Database["public"]["Enums"]["score_state"]
          scoring_model_id: string
          second_best_route: Database["public"]["Enums"]["scoring_route"] | null
          upper_bound: number | null
          weighted_coverage: number
        }
        Insert: {
          agent_run_id?: string | null
          best_route?: Database["public"]["Enums"]["scoring_route"] | null
          blocking_gates?: string[] | null
          buy_beats_alternatives?: boolean | null
          calculated_at?: string
          company_id: string
          created_at?: string
          evidence_penalty?: number | null
          final_score?: number | null
          gates?: Json | null
          id?: string
          input_hash: string
          input_snapshot: Json
          lower_bound?: number | null
          model_version: string
          path?: Database["public"]["Enums"]["target_path"] | null
          positive_normalized?: number | null
          recommendation: Database["public"]["Enums"]["recommendation_state"]
          risk_penalty?: number | null
          score_state: Database["public"]["Enums"]["score_state"]
          scoring_model_id: string
          second_best_route?:
            | Database["public"]["Enums"]["scoring_route"]
            | null
          upper_bound?: number | null
          weighted_coverage: number
        }
        Update: {
          agent_run_id?: string | null
          best_route?: Database["public"]["Enums"]["scoring_route"] | null
          blocking_gates?: string[] | null
          buy_beats_alternatives?: boolean | null
          calculated_at?: string
          company_id?: string
          created_at?: string
          evidence_penalty?: number | null
          final_score?: number | null
          gates?: Json | null
          id?: string
          input_hash?: string
          input_snapshot?: Json
          lower_bound?: number | null
          model_version?: string
          path?: Database["public"]["Enums"]["target_path"] | null
          positive_normalized?: number | null
          recommendation?: Database["public"]["Enums"]["recommendation_state"]
          risk_penalty?: number | null
          score_state?: Database["public"]["Enums"]["score_state"]
          scoring_model_id?: string
          second_best_route?:
            | Database["public"]["Enums"]["scoring_route"]
            | null
          upper_bound?: number | null
          weighted_coverage?: number
        }
        Relationships: [
          {
            foreignKeyName: "scores_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_scoring_model_id_fkey"
            columns: ["scoring_model_id"]
            isOneToOne: false
            referencedRelation: "scoring_models"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_models: {
        Row: {
          activated_at: string | null
          created_at: string
          dimensions: Json
          evidence_bands: Json | null
          hard_gates: Json | null
          id: string
          is_active: boolean
          locked_at: string | null
          owner: string | null
          path: Database["public"]["Enums"]["target_path"] | null
          rationale: string | null
          risk_components: Json | null
          thesis_version: string | null
          thresholds: Json
          version: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          dimensions: Json
          evidence_bands?: Json | null
          hard_gates?: Json | null
          id?: string
          is_active?: boolean
          locked_at?: string | null
          owner?: string | null
          path?: Database["public"]["Enums"]["target_path"] | null
          rationale?: string | null
          risk_components?: Json | null
          thesis_version?: string | null
          thresholds: Json
          version: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          dimensions?: Json
          evidence_bands?: Json | null
          hard_gates?: Json | null
          id?: string
          is_active?: boolean
          locked_at?: string | null
          owner?: string | null
          path?: Database["public"]["Enums"]["target_path"] | null
          rationale?: string | null
          risk_components?: Json | null
          thesis_version?: string | null
          thresholds?: Json
          version?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          accessed_at: string
          agent_run_id: string | null
          content_hash: string | null
          created_at: string
          id: string
          published_at: string | null
          publisher: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          title: string | null
          trust_tier: Database["public"]["Enums"]["source_trust_tier"]
          updated_at: string
          url: string
          url_normalized: string
        }
        Insert: {
          accessed_at?: string
          agent_run_id?: string | null
          content_hash?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          publisher?: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          title?: string | null
          trust_tier: Database["public"]["Enums"]["source_trust_tier"]
          updated_at?: string
          url: string
          url_normalized: string
        }
        Update: {
          accessed_at?: string
          agent_run_id?: string | null
          content_hash?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          publisher?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          title?: string | null
          trust_tier?: Database["public"]["Enums"]["source_trust_tier"]
          updated_at?: string
          url?: string
          url_normalized?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          company_id: string
          created_at: string
          id: string
          reasons: string[]
          review_date: string | null
          status: Database["public"]["Enums"]["watchlist_status"]
          tracked_event_types: Database["public"]["Enums"]["event_type"][]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          reasons?: string[]
          review_date?: string | null
          status?: Database["public"]["Enums"]["watchlist_status"]
          tracked_event_types?: Database["public"]["Enums"]["event_type"][]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          reasons?: string[]
          review_date?: string | null
          status?: Database["public"]["Enums"]["watchlist_status"]
          tracked_event_types?: Database["public"]["Enums"]["event_type"][]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      alias_kind: "legal_entity" | "brand" | "former_name" | "working_alias"
      chat_role: "user" | "assistant"
      claim_kind:
        | "verified_fact"
        | "company_reported"
        | "estimate"
        | "analysis"
        | "unknown"
      claim_source_relation: "supports" | "contradicts"
      confidence_level: "low" | "medium" | "high"
      customer_type:
        | "mass_retail"
        | "affluent"
        | "active_trader"
        | "crypto_native"
        | "adviser_ria"
        | "institutional"
        | "developer_builder"
        | "smb_business"
      deal_status:
        | "rumored"
        | "announced"
        | "signed"
        | "regulatory_review"
        | "closed"
        | "integrated"
        | "divested"
        | "terminated"
      economics_type:
        | "transaction_led"
        | "spread_led"
        | "interest_led"
        | "aua_management_fee"
        | "subscription"
        | "payments_interchange"
        | "b2b_saas"
        | "mixed"
      enabling_layer: "ai" | "data" | "community" | "none"
      entity_role:
        | "operating_company"
        | "product_or_brand"
        | "investor"
        | "industry_body"
        | "government_or_regulator"
        | "individual"
        | "unknown"
      event_category:
        | "acquisition"
        | "funding"
        | "product_launch"
        | "regulatory"
        | "executive"
        | "distress"
        | "other"
      event_type:
        | "acquisition"
        | "divestiture"
        | "strategic_review"
        | "carve_out"
        | "minority_investment"
        | "funding"
        | "down_round"
        | "debt_distress"
        | "layoffs"
        | "shutdown"
        | "founder_exit"
        | "license_grant"
        | "license_application"
        | "license_variation"
        | "license_suspension"
        | "license_withdrawal"
        | "enforcement"
        | "change_of_control"
        | "product_launch"
        | "kpi_change"
        | "security_incident"
        | "custody_incident"
        | "privacy_incident"
        | "aml_incident"
        | "fraud_incident"
        | "conduct_incident"
        | "other"
      fundamental_archetype:
        | "brokerage_active_trading"
        | "wealth_savings"
        | "payments_e_money"
        | "crypto_on_chain"
        | "b2b_infrastructure_saas"
        | "team_ip_tuck_in"
      license_status:
        | "active"
        | "applied"
        | "variation_requested"
        | "suspended"
        | "withdrawn"
        | "revoked"
        | "unknown"
      lifecycle_status:
        | "research_pending"
        | "discovered_unreviewed"
        | "under_review"
        | "active_candidate"
        | "rejected"
        | "screened_out"
        | "precedent"
      ma_state:
        | "independent"
        | "strategic_investor"
        | "sponsor_backed"
        | "sale_process"
        | "announced_acquisition"
        | "pending"
        | "completed"
        | "terminated"
        | "divestiture_carveout_candidate"
      materiality_level: "low" | "medium" | "high"
      product_layer:
        | "brokerage"
        | "options_futures"
        | "execution_oms"
        | "market_data"
        | "retirement"
        | "managed_portfolios"
        | "payments"
        | "e_money"
        | "custody"
        | "wallet"
        | "tokenization"
        | "stablecoin"
        | "dex"
        | "prediction_markets"
        | "ai_analytics"
        | "social_community"
      recommendation_state:
        | "acquire"
        | "invest"
        | "partner"
        | "build"
        | "monitor"
        | "pass"
        | "research_only"
        | "priority_diligence"
        | "shortlist"
        | "watch"
        | "do_not_advance"
        | "blocked"
      record_origin: "bootstrap_identity" | "agent_generated"
      regulatory_role:
        | "broker_dealer"
        | "investment_firm"
        | "fcm_derivatives"
        | "bank"
        | "emi_payment_institution"
        | "casp_vasp"
        | "custodian"
        | "asset_wealth_manager"
        | "pension_super"
        | "unregulated_technology"
      research_state:
        | "pending"
        | "running"
        | "complete"
        | "partial"
        | "blocked"
        | "failed"
      research_tier: "indexed" | "monitored" | "deep"
      run_status:
        | "running"
        | "success"
        | "partial_success"
        | "failed"
        | "blocked"
      run_trigger: "scheduled" | "manual" | "bootstrap"
      score_state: "scored" | "research_only"
      scoring_route: "build" | "partner" | "buy" | "invest" | "watch"
      source_trust_tier: "primary" | "secondary" | "tertiary"
      source_type:
        | "regulator_registry"
        | "securities_filing"
        | "company_official"
        | "transaction_party"
        | "investor"
        | "financial_press"
        | "specialist_database"
        | "trade_press"
        | "other"
      strategic_theme:
        | "trading"
        | "investing"
        | "wealth_management"
        | "neo_banking"
      strategic_vector:
        | "geographic_entry"
        | "regulatory_acceleration"
        | "product_expansion"
        | "technology_ip"
        | "talent"
        | "customer_acquisition"
        | "aua_acquisition"
        | "infrastructure"
        | "defensive_move"
      target_object:
        | "full_company"
        | "regulated_subsidiary"
        | "business_unit"
        | "product_ip"
        | "team_acquihire"
        | "customer_book"
        | "license_entity"
        | "minority_investment"
      target_path: "platform" | "tuck_in" | "hybrid"
      value_status: "disclosed" | "estimated" | "unknown" | "not_applicable"
      verification_status: "unverified" | "verified" | "disputed" | "superseded"
      watchlist_status: "watching" | "paused" | "removed"
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
      alias_kind: ["legal_entity", "brand", "former_name", "working_alias"],
      chat_role: ["user", "assistant"],
      claim_kind: [
        "verified_fact",
        "company_reported",
        "estimate",
        "analysis",
        "unknown",
      ],
      claim_source_relation: ["supports", "contradicts"],
      confidence_level: ["low", "medium", "high"],
      customer_type: [
        "mass_retail",
        "affluent",
        "active_trader",
        "crypto_native",
        "adviser_ria",
        "institutional",
        "developer_builder",
        "smb_business",
      ],
      deal_status: [
        "rumored",
        "announced",
        "signed",
        "regulatory_review",
        "closed",
        "integrated",
        "divested",
        "terminated",
      ],
      economics_type: [
        "transaction_led",
        "spread_led",
        "interest_led",
        "aua_management_fee",
        "subscription",
        "payments_interchange",
        "b2b_saas",
        "mixed",
      ],
      enabling_layer: ["ai", "data", "community", "none"],
      entity_role: [
        "operating_company",
        "product_or_brand",
        "investor",
        "industry_body",
        "government_or_regulator",
        "individual",
        "unknown",
      ],
      event_category: [
        "acquisition",
        "funding",
        "product_launch",
        "regulatory",
        "executive",
        "distress",
        "other",
      ],
      event_type: [
        "acquisition",
        "divestiture",
        "strategic_review",
        "carve_out",
        "minority_investment",
        "funding",
        "down_round",
        "debt_distress",
        "layoffs",
        "shutdown",
        "founder_exit",
        "license_grant",
        "license_application",
        "license_variation",
        "license_suspension",
        "license_withdrawal",
        "enforcement",
        "change_of_control",
        "product_launch",
        "kpi_change",
        "security_incident",
        "custody_incident",
        "privacy_incident",
        "aml_incident",
        "fraud_incident",
        "conduct_incident",
        "other",
      ],
      fundamental_archetype: [
        "brokerage_active_trading",
        "wealth_savings",
        "payments_e_money",
        "crypto_on_chain",
        "b2b_infrastructure_saas",
        "team_ip_tuck_in",
      ],
      license_status: [
        "active",
        "applied",
        "variation_requested",
        "suspended",
        "withdrawn",
        "revoked",
        "unknown",
      ],
      lifecycle_status: [
        "research_pending",
        "discovered_unreviewed",
        "under_review",
        "active_candidate",
        "rejected",
        "screened_out",
        "precedent",
      ],
      ma_state: [
        "independent",
        "strategic_investor",
        "sponsor_backed",
        "sale_process",
        "announced_acquisition",
        "pending",
        "completed",
        "terminated",
        "divestiture_carveout_candidate",
      ],
      materiality_level: ["low", "medium", "high"],
      product_layer: [
        "brokerage",
        "options_futures",
        "execution_oms",
        "market_data",
        "retirement",
        "managed_portfolios",
        "payments",
        "e_money",
        "custody",
        "wallet",
        "tokenization",
        "stablecoin",
        "dex",
        "prediction_markets",
        "ai_analytics",
        "social_community",
      ],
      recommendation_state: [
        "acquire",
        "invest",
        "partner",
        "build",
        "monitor",
        "pass",
        "research_only",
        "priority_diligence",
        "shortlist",
        "watch",
        "do_not_advance",
        "blocked",
      ],
      record_origin: ["bootstrap_identity", "agent_generated"],
      regulatory_role: [
        "broker_dealer",
        "investment_firm",
        "fcm_derivatives",
        "bank",
        "emi_payment_institution",
        "casp_vasp",
        "custodian",
        "asset_wealth_manager",
        "pension_super",
        "unregulated_technology",
      ],
      research_state: [
        "pending",
        "running",
        "complete",
        "partial",
        "blocked",
        "failed",
      ],
      research_tier: ["indexed", "monitored", "deep"],
      run_status: [
        "running",
        "success",
        "partial_success",
        "failed",
        "blocked",
      ],
      run_trigger: ["scheduled", "manual", "bootstrap"],
      score_state: ["scored", "research_only"],
      scoring_route: ["build", "partner", "buy", "invest", "watch"],
      source_trust_tier: ["primary", "secondary", "tertiary"],
      source_type: [
        "regulator_registry",
        "securities_filing",
        "company_official",
        "transaction_party",
        "investor",
        "financial_press",
        "specialist_database",
        "trade_press",
        "other",
      ],
      strategic_theme: [
        "trading",
        "investing",
        "wealth_management",
        "neo_banking",
      ],
      strategic_vector: [
        "geographic_entry",
        "regulatory_acceleration",
        "product_expansion",
        "technology_ip",
        "talent",
        "customer_acquisition",
        "aua_acquisition",
        "infrastructure",
        "defensive_move",
      ],
      target_object: [
        "full_company",
        "regulated_subsidiary",
        "business_unit",
        "product_ip",
        "team_acquihire",
        "customer_book",
        "license_entity",
        "minority_investment",
      ],
      target_path: ["platform", "tuck_in", "hybrid"],
      value_status: ["disclosed", "estimated", "unknown", "not_applicable"],
      verification_status: ["unverified", "verified", "disputed", "superseded"],
      watchlist_status: ["watching", "paused", "removed"],
    },
  },
} as const

