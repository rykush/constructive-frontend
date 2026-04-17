import { api } from "./api";

export interface Attachment {
  attachment_id: number;
  attachment_type: string;
  attachment_name: string;
  attachment_path: string;
  attachment_status: string;
}

export interface User {
  user_id: number;
  nickname: string;
  username: string;
  user_status: string;
  friends_ids: number[];
  attachment_id: number | null;
}

export interface Dialog {
  dialog_id: number;
  dialog_name: string;
  user_ids: number[];
  pinned: number[];
  attachment_id: number | null;
}

export interface Message {
  message_id: number;
  dialog_id: number;
  user_id: number;
  message_text: string;
  message_status: string;
  attachment_id: number | null;
  created_at: string;
}

export const chatApi = {
  getUsers: async (): Promise<User[]> => {
    const { data } = await api.get("/users.json");
    return data;
  },
  getAttachments: async (): Promise<Attachment[]> => {
    const { data } = await api.get("/attachments.json");
    return data;
  },
  getDialogs: async (): Promise<Dialog[]> => {
    const { data } = await api.get("/dialogs.json");
    return data;
  },
  getMessages: async (): Promise<Message[]> => {
    const { data } = await api.get("/messages.json");
    return data;
  }
};