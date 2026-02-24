export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          notes: string | null;
          stripe_customer_id: string | null;
          customer_type: Database["public"]["Enums"]["customer_type"];
          fleet_account: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          first_name: string;
          last_name: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          stripe_customer_id?: string | null;
          customer_type?: Database["public"]["Enums"]["customer_type"];
          fleet_account?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          stripe_customer_id?: string | null;
          customer_type?: Database["public"]["Enums"]["customer_type"];
          fleet_account?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          customer_id: string;
          year: number | null;
          make: string | null;
          model: string | null;
          vin: string | null;
          license_plate: string | null;
          mileage: number | null;
          color: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          year?: number | null;
          make?: string | null;
          model?: string | null;
          vin?: string | null;
          license_plate?: string | null;
          mileage?: number | null;
          color?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          year?: number | null;
          make?: string | null;
          model?: string | null;
          vin?: string | null;
          license_plate?: string | null;
          mileage?: number | null;
          color?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          id: string;
          customer_id: string;
          vehicle_id: string | null;
          status: Database["public"]["Enums"]["job_status"];
          title: string | null;
          category: string | null;
          assigned_tech: string | null;
          date_received: string;
          date_finished: string | null;
          notes: string | null;
          payment_method: Database["public"]["Enums"]["payment_method"] | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          mileage_in: number | null;
          stripe_payment_intent_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          vehicle_id?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          title?: string | null;
          category?: string | null;
          assigned_tech?: string | null;
          date_received?: string;
          date_finished?: string | null;
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          mileage_in?: number | null;
          stripe_payment_intent_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          vehicle_id?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          title?: string | null;
          category?: string | null;
          assigned_tech?: string | null;
          date_received?: string;
          date_finished?: string | null;
          notes?: string | null;
          payment_method?: Database["public"]["Enums"]["payment_method"] | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          mileage_in?: number | null;
          stripe_payment_intent_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_assigned_tech_fkey";
            columns: ["assigned_tech"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      job_line_items: {
        Row: {
          id: string;
          job_id: string;
          type: Database["public"]["Enums"]["line_item_type"];
          description: string;
          quantity: number;
          unit_cost: number;
          total: number;
          part_number: string | null;
          category: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          type: Database["public"]["Enums"]["line_item_type"];
          description: string;
          quantity?: number;
          unit_cost?: number;
          part_number?: string | null;
          category?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          type?: Database["public"]["Enums"]["line_item_type"];
          description?: string;
          quantity?: number;
          unit_cost?: number;
          part_number?: string | null;
          category?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_line_items_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      job_presets: {
        Row: {
          id: string;
          name: string;
          category: string | null;
          line_items: Json;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category?: string | null;
          line_items?: Json;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string | null;
          line_items?: Json;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      estimates: {
        Row: {
          id: string;
          job_id: string;
          status: Database["public"]["Enums"]["estimate_status"];
          sent_at: string | null;
          approved_at: string | null;
          declined_at: string | null;
          tax_rate: number;
          approval_token: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          status?: Database["public"]["Enums"]["estimate_status"];
          sent_at?: string | null;
          approved_at?: string | null;
          declined_at?: string | null;
          tax_rate?: number;
          approval_token?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          status?: Database["public"]["Enums"]["estimate_status"];
          sent_at?: string | null;
          approved_at?: string | null;
          declined_at?: string | null;
          tax_rate?: number;
          approval_token?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "estimates_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      estimate_line_items: {
        Row: {
          id: string;
          estimate_id: string;
          type: Database["public"]["Enums"]["line_item_type"];
          description: string;
          quantity: number;
          unit_cost: number;
          total: number;
          part_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          estimate_id: string;
          type: Database["public"]["Enums"]["line_item_type"];
          description: string;
          quantity?: number;
          unit_cost?: number;
          part_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          estimate_id?: string;
          type?: Database["public"]["Enums"]["line_item_type"];
          description?: string;
          quantity?: number;
          unit_cost?: number;
          part_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "estimate_line_items_estimate_id_fkey";
            columns: ["estimate_id"];
            isOneToOne: false;
            referencedRelation: "estimates";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          id: string;
          job_id: string;
          stripe_invoice_id: string | null;
          status: Database["public"]["Enums"]["invoice_status"];
          amount: number | null;
          paid_at: string | null;
          payment_method: string | null;
          stripe_hosted_invoice_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          stripe_invoice_id?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          amount?: number | null;
          paid_at?: string | null;
          payment_method?: string | null;
          stripe_hosted_invoice_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          stripe_invoice_id?: string | null;
          status?: Database["public"]["Enums"]["invoice_status"];
          amount?: number | null;
          paid_at?: string | null;
          payment_method?: string | null;
          stripe_hosted_invoice_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          customer_id: string;
          job_id: string | null;
          channel: Database["public"]["Enums"]["message_channel"];
          direction: Database["public"]["Enums"]["message_direction"];
          body: string;
          status: string | null;
          sent_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          job_id?: string | null;
          channel: Database["public"]["Enums"]["message_channel"];
          direction: Database["public"]["Enums"]["message_direction"];
          body: string;
          status?: string | null;
          sent_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          job_id?: string | null;
          channel?: Database["public"]["Enums"]["message_channel"];
          direction?: Database["public"]["Enums"]["message_direction"];
          body?: string;
          status?: string | null;
          sent_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          id: string;
          auth_id: string | null;
          name: string;
          email: string;
          role: Database["public"]["Enums"]["user_role"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_id?: string | null;
          name: string;
          email: string;
          role?: Database["public"]["Enums"]["user_role"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_id?: string | null;
          name?: string;
          email?: string;
          role?: Database["public"]["Enums"]["user_role"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      is_manager: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      customer_type: "retail" | "fleet";
      job_status:
        | "not_started"
        | "waiting_for_parts"
        | "in_progress"
        | "complete";
      line_item_type: "labor" | "part";
      estimate_status: "draft" | "sent" | "approved" | "declined";
      invoice_status: "draft" | "sent" | "paid";
      message_channel: "sms" | "email";
      message_direction: "in" | "out";
      payment_method: "stripe" | "cash" | "check" | "ach" | "terminal";
      payment_status: "unpaid" | "invoiced" | "paid" | "waived";
      user_role: "manager" | "tech";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
