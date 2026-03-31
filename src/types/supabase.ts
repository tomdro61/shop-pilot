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
      catalog_items: {
        Row: {
          category: string | null
          created_at: string
          default_cost: number | null
          default_quantity: number
          default_unit_cost: number
          description: string
          id: string
          is_active: boolean
          part_number: string | null
          type: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_cost?: number | null
          default_quantity?: number
          default_unit_cost?: number
          description: string
          id?: string
          is_active?: boolean
          part_number?: string | null
          type: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          default_cost?: number | null
          default_quantity?: number
          default_unit_cost?: number
          description?: string
          id?: string
          is_active?: boolean
          part_number?: string | null
          type?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          email: string | null
          first_name: string
          fleet_account: string | null
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          first_name: string
          fleet_account?: string | null
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          email?: string | null
          first_name?: string
          fleet_account?: string | null
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      daily_inspection_counts: {
        Row: {
          created_at: string | null
          date: string
          id: string
          state_count: number
          tnc_count: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          state_count?: number
          tnc_count?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          state_count?: number
          tnc_count?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      dvi_inspections: {
        Row: {
          approval_token: string | null
          completed_at: string | null
          created_at: string
          id: string
          job_id: string
          send_mode: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["dvi_status"]
          tech_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          approval_token?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          job_id: string
          send_mode?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["dvi_status"]
          tech_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          approval_token?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          job_id?: string
          send_mode?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["dvi_status"]
          tech_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dvi_inspections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dvi_inspections_tech_id_fkey"
            columns: ["tech_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dvi_inspections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "dvi_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      dvi_photos: {
        Row: {
          created_at: string
          id: string
          result_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          result_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          result_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "dvi_photos_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "dvi_results"
            referencedColumns: ["id"]
          },
        ]
      }
      dvi_results: {
        Row: {
          category_name: string
          condition: Database["public"]["Enums"]["dvi_condition"] | null
          created_at: string
          id: string
          inspection_id: string
          is_recommended: boolean
          item_name: string
          note: string | null
          recommended_description: string | null
          recommended_price: number | null
          sort_order: number
          template_item_id: string | null
          updated_at: string
        }
        Insert: {
          category_name: string
          condition?: Database["public"]["Enums"]["dvi_condition"] | null
          created_at?: string
          id?: string
          inspection_id: string
          is_recommended?: boolean
          item_name: string
          note?: string | null
          recommended_description?: string | null
          recommended_price?: number | null
          sort_order?: number
          template_item_id?: string | null
          updated_at?: string
        }
        Update: {
          category_name?: string
          condition?: Database["public"]["Enums"]["dvi_condition"] | null
          created_at?: string
          id?: string
          inspection_id?: string
          is_recommended?: boolean
          item_name?: string
          note?: string | null
          recommended_description?: string | null
          recommended_price?: number | null
          sort_order?: number
          template_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dvi_results_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "dvi_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dvi_results_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "dvi_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      dvi_template_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dvi_template_categories_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "dvi_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      dvi_template_items: {
        Row: {
          category_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dvi_template_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dvi_template_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      dvi_templates: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: []
      }
      estimate_line_items: {
        Row: {
          category: string | null
          created_at: string
          description: string
          estimate_id: string
          id: string
          part_number: string | null
          quantity: number
          total: number | null
          type: Database["public"]["Enums"]["line_item_type"]
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description: string
          estimate_id: string
          id?: string
          part_number?: string | null
          quantity?: number
          total?: number | null
          type: Database["public"]["Enums"]["line_item_type"]
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string
          estimate_id?: string
          id?: string
          part_number?: string | null
          quantity?: number
          total?: number | null
          type?: Database["public"]["Enums"]["line_item_type"]
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_line_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          approval_token: string | null
          approved_at: string | null
          created_at: string
          declined_at: string | null
          id: string
          job_id: string
          notes: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["estimate_status"]
          tax_rate: number
          updated_at: string
        }
        Insert: {
          approval_token?: string | null
          approved_at?: string | null
          created_at?: string
          declined_at?: string | null
          id?: string
          job_id: string
          notes?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["estimate_status"]
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          approval_token?: string | null
          approved_at?: string | null
          created_at?: string
          declined_at?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["estimate_status"]
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          job_id: string | null
          paid_at: string | null
          parking_reservation_id: string | null
          payment_method: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_hosted_invoice_url: string | null
          stripe_invoice_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          job_id?: string | null
          paid_at?: string | null
          parking_reservation_id?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_hosted_invoice_url?: string | null
          stripe_invoice_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          job_id?: string | null
          paid_at?: string | null
          parking_reservation_id?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_hosted_invoice_url?: string | null
          stripe_invoice_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parking_reservation_id_fkey"
            columns: ["parking_reservation_id"]
            isOneToOne: false
            referencedRelation: "parking_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_line_items: {
        Row: {
          category: string | null
          cost: number | null
          created_at: string
          description: string
          id: string
          job_id: string
          part_number: string | null
          quantity: number
          total: number | null
          type: Database["public"]["Enums"]["line_item_type"]
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          cost?: number | null
          created_at?: string
          description: string
          id?: string
          job_id: string
          part_number?: string | null
          quantity?: number
          total?: number | null
          type: Database["public"]["Enums"]["line_item_type"]
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          cost?: number | null
          created_at?: string
          description?: string
          id?: string
          job_id?: string
          part_number?: string | null
          quantity?: number
          total?: number | null
          type?: Database["public"]["Enums"]["line_item_type"]
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_line_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_presets: {
        Row: {
          category: string | null
          created_at: string
          id: string
          line_items: Json
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          line_items?: Json
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          line_items?: Json
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          assigned_tech: string | null
          category: string | null
          created_at: string
          customer_id: string
          date_finished: string | null
          date_received: string
          id: string
          mileage_in: number | null
          notes: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          ro_number: number | null
          status: Database["public"]["Enums"]["job_status"]
          stripe_payment_intent_id: string | null
          title: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          assigned_tech?: string | null
          category?: string | null
          created_at?: string
          customer_id: string
          date_finished?: string | null
          date_received?: string
          id?: string
          mileage_in?: number | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          ro_number?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          stripe_payment_intent_id?: string | null
          title?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          assigned_tech?: string | null
          category?: string | null
          created_at?: string
          customer_id?: string
          date_finished?: string | null
          date_received?: string
          id?: string
          mileage_in?: number | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          ro_number?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          stripe_payment_intent_id?: string | null
          title?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_assigned_tech_fkey"
            columns: ["assigned_tech"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      lock_boxes: {
        Row: {
          box_number: number
          code: string
          created_at: string | null
          id: string
        }
        Insert: {
          box_number: number
          code: string
          created_at?: string | null
          id?: string
        }
        Update: {
          box_number?: number
          code?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["message_channel"]
          created_at: string
          customer_id: string
          direction: Database["public"]["Enums"]["message_direction"]
          id: string
          job_id: string | null
          phone_line: string | null
          sent_at: string
          status: string | null
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          customer_id: string
          direction: Database["public"]["Enums"]["message_direction"]
          id?: string
          job_id?: string | null
          phone_line?: string | null
          sent_at?: string
          status?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["message_channel"]
          created_at?: string
          customer_id?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          id?: string
          job_id?: string | null
          phone_line?: string | null
          sent_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      parking_reservations: {
        Row: {
          arriving_flight: string | null
          checked_in_at: string | null
          checked_out_at: string | null
          color: string | null
          confirmation_number: string
          created_at: string
          customer_id: string | null
          departing_flight: string | null
          drop_off_date: string
          drop_off_time: string
          email: string
          first_name: string
          id: string
          last_name: string
          liability_acknowledged: boolean
          license_plate: string
          lock_box_number: number | null
          lot: string
          make: string
          model: string
          parking_type: string | null
          phone: string
          pick_up_date: string
          pick_up_time: string
          services_completed: string[] | null
          services_interested: string[] | null
          specials_sent_at: string | null
          spot_number: string | null
          staff_notes: string | null
          status: Database["public"]["Enums"]["parking_status"]
          updated_at: string
        }
        Insert: {
          arriving_flight?: string | null
          checked_in_at?: string | null
          checked_out_at?: string | null
          color?: string | null
          confirmation_number: string
          created_at?: string
          customer_id?: string | null
          departing_flight?: string | null
          drop_off_date: string
          drop_off_time: string
          email: string
          first_name: string
          id?: string
          last_name: string
          liability_acknowledged?: boolean
          license_plate: string
          lock_box_number?: number | null
          lot: string
          make: string
          model: string
          parking_type?: string | null
          phone: string
          pick_up_date: string
          pick_up_time: string
          services_completed?: string[] | null
          services_interested?: string[] | null
          specials_sent_at?: string | null
          spot_number?: string | null
          staff_notes?: string | null
          status?: Database["public"]["Enums"]["parking_status"]
          updated_at?: string
        }
        Update: {
          arriving_flight?: string | null
          checked_in_at?: string | null
          checked_out_at?: string | null
          color?: string | null
          confirmation_number?: string
          created_at?: string
          customer_id?: string | null
          departing_flight?: string | null
          drop_off_date?: string
          drop_off_time?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          liability_acknowledged?: boolean
          license_plate?: string
          lock_box_number?: number | null
          lot?: string
          make?: string
          model?: string
          parking_type?: string | null
          phone?: string
          pick_up_date?: string
          pick_up_time?: string
          services_completed?: string[] | null
          services_interested?: string[] | null
          specials_sent_at?: string | null
          spot_number?: string | null
          staff_notes?: string | null
          status?: Database["public"]["Enums"]["parking_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parking_reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          created_at: string
          customer_id: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          message: string | null
          phone: string
          quo_contact_id: string | null
          services: string[]
          status: string
          updated_at: string
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: number | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          message?: string | null
          phone: string
          quo_contact_id?: string | null
          services?: string[]
          status?: string
          updated_at?: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          message?: string | null
          phone?: string
          quo_contact_id?: string | null
          services?: string[]
          status?: string
          updated_at?: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          created_at: string
          hazmat_amount: number
          hazmat_categories: Json | null
          hazmat_enabled: boolean
          hazmat_label: string
          id: string
          job_categories: Json
          shop_supplies_cap: number | null
          shop_supplies_categories: Json | null
          shop_supplies_enabled: boolean
          shop_supplies_method: string
          shop_supplies_rate: number
          tax_rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hazmat_amount?: number
          hazmat_categories?: Json | null
          hazmat_enabled?: boolean
          hazmat_label?: string
          id?: string
          job_categories?: Json
          shop_supplies_cap?: number | null
          shop_supplies_categories?: Json | null
          shop_supplies_enabled?: boolean
          shop_supplies_method?: string
          shop_supplies_rate?: number
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hazmat_amount?: number
          hazmat_categories?: Json | null
          hazmat_enabled?: boolean
          hazmat_label?: string
          id?: string
          job_categories?: Json
          shop_supplies_cap?: number | null
          shop_supplies_categories?: Json | null
          shop_supplies_enabled?: boolean
          shop_supplies_method?: string
          shop_supplies_rate?: number
          tax_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          auth_id: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          auth_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          auth_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          customer_id: string
          id: string
          license_plate: string | null
          make: string | null
          mileage: number | null
          model: string | null
          notes: string | null
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          customer_id: string
          id?: string
          license_plate?: string | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          notes?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          license_plate?: string | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          notes?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_manager: { Args: never; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      customer_type: "retail" | "fleet" | "parking"
      dvi_condition: "good" | "monitor" | "attention"
      dvi_status: "in_progress" | "completed" | "sent"
      estimate_status: "draft" | "sent" | "approved" | "declined"
      invoice_status: "draft" | "sent" | "paid"
      job_status:
        | "not_started"
        | "waiting_for_parts"
        | "in_progress"
        | "complete"
      line_item_type: "labor" | "part"
      message_channel: "sms" | "email"
      message_direction: "in" | "out"
      parking_status:
        | "reserved"
        | "checked_in"
        | "checked_out"
        | "no_show"
        | "cancelled"
      payment_method: "stripe" | "cash" | "check" | "ach" | "terminal"
      payment_status: "unpaid" | "invoiced" | "paid" | "waived"
      user_role: "manager" | "tech"
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
      customer_type: ["retail", "fleet", "parking"],
      dvi_condition: ["good", "monitor", "attention"],
      dvi_status: ["in_progress", "completed", "sent"],
      estimate_status: ["draft", "sent", "approved", "declined"],
      invoice_status: ["draft", "sent", "paid"],
      job_status: [
        "not_started",
        "waiting_for_parts",
        "in_progress",
        "complete",
      ],
      line_item_type: ["labor", "part"],
      message_channel: ["sms", "email"],
      message_direction: ["in", "out"],
      parking_status: [
        "reserved",
        "checked_in",
        "checked_out",
        "no_show",
        "cancelled",
      ],
      payment_method: ["stripe", "cash", "check", "ach", "terminal"],
      payment_status: ["unpaid", "invoiced", "paid", "waived"],
      user_role: ["manager", "tech"],
    },
  },
} as const
