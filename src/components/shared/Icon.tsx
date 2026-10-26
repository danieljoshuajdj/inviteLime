import { cn } from "@/lib/utils";

export type IconName =
  | "menu"
  | "close"
  | "arrow_forward"
  | "arrow_back"
  | "arrow_upward"
  | "play_circle"
  | "pause"
  | "play_arrow"
  | "star"
  | "star_half"
  | "favorite"
  | "favorite_border"
  | "chevron_right"
  | "chevron_left"
  | "keyboard_arrow_down"
  | "keyboard_arrow_up"
  | "calendar_month"
  | "schedule"
  | "location_on"
  | "map"
  | "north_east"
  | "east"
  | "qr_code_2"
  | "share"
  | "content_copy"
  | "check"
  | "check_circle"
  | "error"
  | "expand_more"
  | "expand_less"
  | "add"
  | "add_circle"
  | "edit"
  | "delete"
  | "lock"
  | "visibility"
  | "visibility_off"
  | "person"
  | "group"
  | "mail"
  | "phone"
  | "logout"
  | "login"
  | "settings"
  | "dashboard"
  | "inventory_2"
  | "category"
  | "verified_user"
  | "payments"
  | "receipt_long"
  | "cloud_upload"
  | "download"
  | "image"
  | "music_note"
  | "queue_music"
  | "videocam"
  | "public"
  | "link"
  | "search"
  | "tune"
  | "filter_list"
  | "grid_view"
  | "view_agenda"
  | "refresh"
  | "more_vert"
  | "more_horiz"
  | "warning"
  | "info"
  | "help"
  | "help_outline"
  | "home"
  | "storefront"
  | "auto_awesome"
  | "diamond"
  | "spa"
  | "celebration"
  | "local_florist"
  | "flight"
  | "church"
  | "diversity_1"
  | "handshake"
  | "music_off"
  | "slideshow"
  | "flip"
  | "rocket_launch"
  | "send"
  | "bolt"
  | "palette"
  | "text_fields"
  | "upload"
  | "group_off"
  | "save"
  | "block"
  | "publish"
  | "lock_open"
  | "mark_email_unread"
  | "xs"
  | "shield_lock"
  | "encrypted"
  | "history_edu"
  | "open_in_new"
  | "workspace_premium"
  | "ios_share"
  | "chat"
  | "mark_email_read"
  | "verified"
  | "cloud_done"
  | "forward_to_inbox"
  | "check_box"
  | "check_box_outline_blank"
  | "graphic_eq"
  | "calendar_today"
  | "arrow_drop_down"
  | "table_view"
  | "layers"
  | "account_balance_wallet"
  | "trending_up"
  | "person_add"
  | "auto_stories"
  | "brush"
  | "preview"
  | "how_to_reg";

interface IconProps {
  name: IconName;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  filled?: boolean;
  weight?: "w200" | "w400" | "w500" | "w600" | "w700";
  ariaLabel?: string;
}

const sizeMap = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
  xl: "text-5xl",
  "2xl": "text-7xl",
};

export function Icon({ name, className, size = "md", filled = false, weight = "w400", ariaLabel }: IconProps) {
  return (
    <span
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "material-symbols-outlined select-none",
        sizeMap[size],
        weight,
        filled && "font-variation-fill",
        className
      )}
      style={
        filled
          ? { fontVariationSettings: `'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24` }
          : undefined
      }
    >
      {name}
    </span>
  );
}