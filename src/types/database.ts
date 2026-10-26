export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProfileRole = "customer" | "planner" | "admin";
export type TemplateStatus = "active" | "disabled" | "draft";
export type WeddingStatus = "draft" | "active" | "expired" | "cancelled";
export type OrderStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";
export type PlannerBillingCycle = "monthly" | "yearly";
export type PlannerSubscriptionStatus = "pending" | "active" | "past_due" | "cancelled" | "expired";
export type PlannerSubscriptionSource = "admin" | "razorpay";
export type WeddingBillingSource = "one_time" | "planner_plan";
export type MediaType = "image" | "video" | "audio";
export type MediaRole = "bride" | "groom" | "couple" | "gallery" | "music" | "video";
export type MediaPackRole = "bride" | "groom" | "couple" | "gallery";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          role: ProfileRole;
          status: string;
          avatar_url: string | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          role?: ProfileRole;
          status?: string;
          avatar_url?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          phone?: string | null;
          role?: ProfileRole;
          status?: string;
          avatar_url?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      planner_plans: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          monthly_price_paise: number;
          yearly_price_paise: number;
          currency: string;
          monthly_invitation_limit: number | null;
          yearly_invitation_limit: number | null;
          razorpay_monthly_plan_id: string | null;
          razorpay_yearly_plan_id: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          monthly_price_paise?: number;
          yearly_price_paise?: number;
          currency?: string;
          monthly_invitation_limit?: number | null;
          yearly_invitation_limit?: number | null;
          razorpay_monthly_plan_id?: string | null;
          razorpay_yearly_plan_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          monthly_price_paise?: number;
          yearly_price_paise?: number;
          currency?: string;
          monthly_invitation_limit?: number | null;
          yearly_invitation_limit?: number | null;
          razorpay_monthly_plan_id?: string | null;
          razorpay_yearly_plan_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      planner_subscriptions: {
        Row: {
          id: string;
          profile_id: string;
          plan_id: string;
          billing_cycle: PlannerBillingCycle;
          status: PlannerSubscriptionStatus;
          current_period_start: string;
          current_period_end: string;
          cancellation_requested_at: string | null;
          cancel_at_period_end: boolean;
          invitations_used: number;
          invitation_limit_override: number | null;
          source: PlannerSubscriptionSource;
          provider_subscription_id: string | null;
          created_by: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          plan_id: string;
          billing_cycle: PlannerBillingCycle;
          status?: PlannerSubscriptionStatus;
          current_period_start?: string;
          current_period_end: string;
          cancellation_requested_at?: string | null;
          cancel_at_period_end?: boolean;
          invitations_used?: number;
          invitation_limit_override?: number | null;
          source?: PlannerSubscriptionSource;
          provider_subscription_id?: string | null;
          created_by?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          plan_id?: string;
          billing_cycle?: PlannerBillingCycle;
          status?: PlannerSubscriptionStatus;
          current_period_start?: string;
          current_period_end?: string;
          cancellation_requested_at?: string | null;
          cancel_at_period_end?: boolean;
          invitations_used?: number;
          invitation_limit_override?: number | null;
          source?: PlannerSubscriptionSource;
          provider_subscription_id?: string | null;
          created_by?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      planner_branding: {
        Row: {
          profile_id: string;
          brand_name: string;
          contact_phone: string;
          address: string | null;
          maps_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          brand_name: string;
          contact_phone: string;
          address?: string | null;
          maps_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          profile_id?: string;
          brand_name?: string;
          contact_phone?: string;
          address?: string | null;
          maps_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price_paise: number;
          currency: string;
          active: boolean;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          price_paise: number;
          currency?: string;
          active?: boolean;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          price_paise?: number;
          currency?: string;
          active?: boolean;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      product_prices: {
        Row: {
          id: string;
          product_id: string;
          currency: string;
          amount_minor: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          currency: string;
          amount_minor: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          currency?: string;
          amount_minor?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      templates: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          status: TemplateStatus;
          thumbnail_path: string | null;
          preview_gif_path: string | null;
          product_id: string | null;
          media_pack_id: string | null;
          demo_detail_pack_id: string | null;
          music_track_id: string | null;
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          status?: TemplateStatus;
          thumbnail_path?: string | null;
          preview_gif_path?: string | null;
          product_id?: string | null;
          media_pack_id?: string | null;
          demo_detail_pack_id?: string | null;
          music_track_id?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          status?: TemplateStatus;
          thumbnail_path?: string | null;
          preview_gif_path?: string | null;
          product_id?: string | null;
          media_pack_id?: string | null;
          demo_detail_pack_id?: string | null;
          music_track_id?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      template_categories: {
        Row: {
          template_id: string;
          category_id: string;
        };
        Insert: { template_id: string; category_id: string };
        Update: { template_id?: string; category_id?: string };
        Relationships: [];
      };
      template_versions: {
        Row: {
          id: string;
          template_id: string;
          version: string;
          storage_prefix: string;
          manifest: Json;
          is_current: boolean;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          version: string;
          storage_prefix: string;
          manifest?: Json;
          is_current?: boolean;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          version?: string;
          storage_prefix?: string;
          manifest?: Json;
          is_current?: boolean;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      weddings: {
        Row: {
          id: string;
          user_id: string | null;
          guest_session_id: string | null;
          template_id: string | null;
          template_version_id: string | null;
          product_id: string | null;
          slug: string | null;
          bride_name: string | null;
          groom_name: string | null;
          couple_bio: string | null;
          story: string | null;
          wedding_date: string | null;
          wedding_time: string | null;
          venue: string | null;
          address: string | null;
          maps_url: string | null;
          latitude: number | null;
          longitude: number | null;
          wedding_data: Json;
          email: string | null;
          status: WeddingStatus;
          expiration_date: string | null;
          rsvp_toggle: boolean;
          rsvp_deadline: string | null;
          published_at: string | null;
          planner_id: string | null;
          planner_subscription_id: string | null;
          billing_source: WeddingBillingSource;
          planner_brand_snapshot: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          guest_session_id?: string | null;
          template_id: string;
          template_version_id: string;
          product_id?: string | null;
          slug?: string | null;
          bride_name?: string | null;
          groom_name?: string | null;
          couple_bio?: string | null;
          story?: string | null;
          wedding_date?: string | null;
          wedding_time?: string | null;
          venue?: string | null;
          address?: string | null;
          maps_url?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          wedding_data?: Json;
          email?: string | null;
          status?: WeddingStatus;
          expiration_date?: string | null;
          rsvp_toggle?: boolean;
          rsvp_deadline?: string | null;
          published_at?: string | null;
          planner_id?: string | null;
          planner_subscription_id?: string | null;
          billing_source?: WeddingBillingSource;
          planner_brand_snapshot?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          guest_session_id?: string | null;
          template_id?: string | null;
          template_version_id?: string | null;
          product_id?: string | null;
          slug?: string | null;
          bride_name?: string | null;
          groom_name?: string | null;
          couple_bio?: string | null;
          story?: string | null;
          wedding_date?: string | null;
          wedding_time?: string | null;
          venue?: string | null;
          address?: string | null;
          maps_url?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          wedding_data?: Json;
          email?: string | null;
          status?: WeddingStatus;
          expiration_date?: string | null;
          rsvp_toggle?: boolean;
          rsvp_deadline?: string | null;
          published_at?: string | null;
          planner_id?: string | null;
          planner_subscription_id?: string | null;
          billing_source?: WeddingBillingSource;
          planner_brand_snapshot?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      wedding_events: {
        Row: {
          id: string;
          wedding_id: string;
          name: string;
          date: string | null;
          time: string | null;
          venue: string | null;
          address: string | null;
          maps_url: string | null;
          description: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          wedding_id: string;
          name: string;
          date?: string | null;
          time?: string | null;
          venue?: string | null;
          address?: string | null;
          maps_url?: string | null;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          wedding_id?: string;
          name?: string;
          date?: string | null;
          time?: string | null;
          venue?: string | null;
          address?: string | null;
          maps_url?: string | null;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      wedding_media: {
        Row: {
          id: string;
          wedding_id: string;
          type: MediaType;
          role: MediaRole;
          storage_key: string;
          public_url: string | null;
          mime_type: string | null;
          width: number | null;
          height: number | null;
          duration_ms: number | null;
          size_bytes: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          wedding_id: string;
          type: MediaType;
          role: MediaRole;
          storage_key: string;
          public_url?: string | null;
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          duration_ms?: number | null;
          size_bytes?: number | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          wedding_id?: string;
          type?: MediaType;
          role?: MediaRole;
          storage_key?: string;
          public_url?: string | null;
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          duration_ms?: number | null;
          size_bytes?: number | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      music_tracks: {
        Row: {
          id: string;
          title: string;
          artist: string | null;
          storage_key: string;
          public_url: string;
          mime_type: string;
          size_bytes: number | null;
          duration_ms: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          artist?: string | null;
          storage_key: string;
          public_url: string;
          mime_type: string;
          size_bytes?: number | null;
          duration_ms?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          artist?: string | null;
          storage_key?: string;
          public_url?: string;
          mime_type?: string;
          size_bytes?: number | null;
          duration_ms?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      media_packs: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      media_pack_items: {
        Row: {
          id: string;
          pack_id: string;
          role: MediaPackRole;
          storage_key: string;
          public_url: string;
          mime_type: string;
          size_bytes: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          pack_id: string;
          role: MediaPackRole;
          storage_key: string;
          public_url: string;
          mime_type: string;
          size_bytes?: number | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          pack_id?: string;
          role?: MediaPackRole;
          storage_key?: string;
          public_url?: string;
          mime_type?: string;
          size_bytes?: number | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      demo_detail_packs: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          bride_name: string;
          groom_name: string;
          bride_designation: string | null;
          groom_designation: string | null;
          bride_bio: string | null;
          groom_bio: string | null;
          couple_bio: string | null;
          story: string | null;
          wedding_date: string | null;
          wedding_time: string | null;
          venue: string | null;
          address: string | null;
          maps_url: string | null;
          latitude: number | null;
          longitude: number | null;
          dress_bride_color: string | null;
          dress_bride_color_name: string | null;
          dress_groom_color: string | null;
          dress_groom_color_name: string | null;
          rsvp_deadline: string | null;
          rsvp_contact_name: string | null;
          rsvp_contact_phone: string | null;
          rsvp_whatsapp: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          bride_name: string;
          groom_name: string;
          bride_designation?: string | null;
          groom_designation?: string | null;
          bride_bio?: string | null;
          groom_bio?: string | null;
          couple_bio?: string | null;
          story?: string | null;
          wedding_date?: string | null;
          wedding_time?: string | null;
          venue?: string | null;
          address?: string | null;
          maps_url?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          dress_bride_color?: string | null;
          dress_bride_color_name?: string | null;
          dress_groom_color?: string | null;
          dress_groom_color_name?: string | null;
          rsvp_deadline?: string | null;
          rsvp_contact_name?: string | null;
          rsvp_contact_phone?: string | null;
          rsvp_whatsapp?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          bride_name?: string;
          groom_name?: string;
          bride_designation?: string | null;
          groom_designation?: string | null;
          bride_bio?: string | null;
          groom_bio?: string | null;
          couple_bio?: string | null;
          story?: string | null;
          wedding_date?: string | null;
          wedding_time?: string | null;
          venue?: string | null;
          address?: string | null;
          maps_url?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          dress_bride_color?: string | null;
          dress_bride_color_name?: string | null;
          dress_groom_color?: string | null;
          dress_groom_color_name?: string | null;
          rsvp_deadline?: string | null;
          rsvp_contact_name?: string | null;
          rsvp_contact_phone?: string | null;
          rsvp_whatsapp?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      demo_detail_pack_events: {
        Row: {
          id: string;
          pack_id: string;
          name: string;
          date: string | null;
          time: string | null;
          venue: string | null;
          address: string | null;
          maps_url: string | null;
          description: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          pack_id: string;
          name: string;
          date?: string | null;
          time?: string | null;
          venue?: string | null;
          address?: string | null;
          maps_url?: string | null;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          pack_id?: string;
          name?: string;
          date?: string | null;
          time?: string | null;
          venue?: string | null;
          address?: string | null;
          maps_url?: string | null;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      favorite_templates: {
        Row: {
          user_id: string;
          template_id: string;
          created_at: string;
        };
        Insert: { user_id: string; template_id: string; created_at?: string };
        Update: {
          user_id?: string;
          template_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      guest_sessions: {
        Row: {
          id: string;
          access_token: string;
          ip_address: string | null;
          user_agent: string | null;
          expires_at: string;
          created_at: string;
          last_seen_at: string | null;
        };
        Insert: {
          id?: string;
          access_token: string;
          ip_address?: string | null;
          user_agent?: string | null;
          expires_at: string;
          created_at?: string;
          last_seen_at?: string | null;
        };
        Update: {
          id?: string;
          access_token?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          expires_at?: string;
          created_at?: string;
          last_seen_at?: string | null;
        };
        Relationships: [];
      };
      guest_drafts: {
        Row: {
          id: string;
          session_id: string;
          template_id: string;
          template_version_id: string;
          wedding_data: Json;
          email: string | null;
          status: string;
          expires_at: string;
          planner_id: string | null;
          planner_subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          template_id: string;
          template_version_id: string;
          wedding_data?: Json;
          email?: string | null;
          status?: string;
          expires_at: string;
          planner_id?: string | null;
          planner_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          template_id?: string;
          template_version_id?: string;
          wedding_data?: Json;
          email?: string | null;
          status?: string;
          expires_at?: string;
          planner_id?: string | null;
          planner_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          user_id: string | null;
          guest_session_id: string | null;
          draft_id: string | null;
          wedding_id: string | null;
          template_id: string;
          template_version_id: string;
          product_id: string | null;
          amount_paise: number;
          currency: string;
          provider: string;
          provider_order_id: string | null;
          provider_payment_id: string | null;
          planner_subscription_id: string | null;
          status: OrderStatus;
          created_at: string;
          paid_at: string | null;
          refunded_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          guest_session_id?: string | null;
          draft_id?: string | null;
          wedding_id?: string | null;
          template_id: string;
          template_version_id: string;
          product_id?: string | null;
          amount_paise: number;
          currency?: string;
          provider?: string;
          provider_order_id?: string | null;
          provider_payment_id?: string | null;
          planner_subscription_id?: string | null;
          status?: OrderStatus;
          created_at?: string;
          paid_at?: string | null;
          refunded_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          guest_session_id?: string | null;
          draft_id?: string | null;
          wedding_id?: string | null;
          template_id?: string;
          template_version_id?: string;
          product_id?: string | null;
          amount_paise?: number;
          currency?: string;
          provider?: string;
          provider_order_id?: string | null;
          provider_payment_id?: string | null;
          planner_subscription_id?: string | null;
          status?: OrderStatus;
          created_at?: string;
          paid_at?: string | null;
          refunded_at?: string | null;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          wedding_id: string;
          order_id: string | null;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          provider: string;
          amount_paise: number;
          currency: string;
          status: string;
          paid_at: string | null;
          raw: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          wedding_id: string;
          order_id?: string | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          provider?: string;
          amount_paise: number;
          currency?: string;
          status?: string;
          paid_at?: string | null;
          raw?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          wedding_id?: string;
          order_id?: string | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          provider?: string;
          amount_paise?: number;
          currency?: string;
          status?: string;
          paid_at?: string | null;
          raw?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      rsvp_responses: {
        Row: {
          id: string;
          wedding_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          attendance: string;
          guests: number;
          dietary: string | null;
          message: string | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          wedding_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          attendance: string;
          guests?: number;
          dietary?: string | null;
          message?: string | null;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          wedding_id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          attendance?: string;
          guests?: number;
          dietary?: string | null;
          message?: string | null;
          source?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      invitation_views: {
        Row: {
          id: string;
          wedding_id: string;
          viewed_at: string;
          referrer: string | null;
          user_agent: string | null;
          ip_address: string | null;
        };
        Insert: {
          id?: string;
          wedding_id: string;
          viewed_at?: string;
          referrer?: string | null;
          user_agent?: string | null;
          ip_address?: string | null;
        };
        Update: {
          id?: string;
          wedding_id?: string;
          viewed_at?: string;
          referrer?: string | null;
          user_agent?: string | null;
          ip_address?: string | null;
        };
        Relationships: [];
      };
      email_deliveries: {
        Row: {
          id: string;
          to_email: string;
          subject: string;
          template_key: string;
          wedding_id: string | null;
          user_id: string | null;
          status: string;
          provider_message_id: string | null;
          error: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          to_email: string;
          subject: string;
          template_key: string;
          wedding_id?: string | null;
          user_id?: string | null;
          status?: string;
          provider_message_id?: string | null;
          error?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          to_email?: string;
          subject?: string;
          template_key?: string;
          wedding_id?: string | null;
          user_id?: string | null;
          status?: string;
          provider_message_id?: string | null;
          error?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          admin_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      analytics_events: {
        Row: {
          id: string;
          event: string;
          wedding_id: string | null;
          template_id: string | null;
          user_id: string | null;
          session_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event: string;
          wedding_id?: string | null;
          template_id?: string | null;
          user_id?: string | null;
          session_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event?: string;
          wedding_id?: string | null;
          template_id?: string | null;
          user_id?: string | null;
          session_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: { key: string; value: Json; updated_at?: string };
        Update: { key?: string; value?: Json; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_guest_session: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_guest_draft: {
        Args: { p_token: string };
        Returns: Json;
      };
      save_guest_draft: {
        Args: {
          p_token: string;
          p_template_id: string;
          p_template_version_id: string;
          p_wedding_data: Json;
          p_email?: string | null;
        };
        Returns: Json;
      };
      submit_rsvp: {
        Args: {
          p_wedding_id: string;
          p_name: string;
          p_email?: string | null;
          p_phone?: string | null;
          p_attendance: string;
          p_guests?: number;
          p_dietary?: string | null;
          p_message?: string | null;
        };
        Returns: Json;
      };
      record_invitation_view: {
        Args: {
          p_wedding_id: string;
          p_referrer?: string | null;
          p_user_agent?: string | null;
          p_ip?: string | null;
        };
        Returns: Json;
      };
      record_analytics_event: {
        Args: {
          p_event: string;
          p_wedding_id?: string | null;
          p_template_id?: string | null;
          p_user_id?: string | null;
          p_session_id?: string | null;
          p_metadata?: Json;
        };
        Returns: Json;
      };
      mark_expired_invitations: {
        Args: Record<string, never>;
        Returns: number;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      claim_planner_invitation: {
        Args: {
          p_subscription_id: string;
          p_profile_id: string;
        };
        Returns: boolean;
      };
      release_planner_invitation: {
        Args: {
          p_subscription_id: string;
        };
        Returns: null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}