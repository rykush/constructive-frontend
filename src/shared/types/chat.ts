import type { Dialog, Message, User } from "@/shared/api/chatApi";

export type ChatKind = "direct" | "group" | "favorites";
export type ThemeMode = "system" | "light" | "blue" | "dark" | "glass";
export type UploadMode = "compressed" | "original";

export interface AppDialog extends Dialog {
  kind?: ChatKind;
  customPhoto?: string | null;
  customName?: string | null;
  adminUserId?: number | null;
  manualUnread?: boolean;
}

export interface MessageAttachmentDraft {
  id: string;
  name: string;
  type: string;
  preview?: string;
  size: number;
  uploadMode: UploadMode;
  sentAsFile?: boolean;
  serverName?: string;
  qualities?: Array<{
    label: string;
    url: string;
  }>;
}

export interface AppMessage extends Message {
  edited?: boolean;
  deleted?: boolean;
  pinned?: boolean;
  replyToId?: number | null;
  forwardedFromId?: number | null;
  forwardedFromDialogId?: number | null;
  attachments?: MessageAttachmentDraft[];
}

export interface AppUser extends User {
  login?: string;
  generatedId: string;
  customId: string | null;
  avatar?: string | null;
}

export interface ProfileModalState {
  user: AppUser;
  dialogId?: number | null;
  isOwnProfile?: boolean;
}
