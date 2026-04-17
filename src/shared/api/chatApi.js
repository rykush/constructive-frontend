import { api } from "./api";
export const chatApi = {
    getUsers: async () => {
        const { data } = await api.get("/users.json");
        return data;
    },
    getAttachments: async () => {
        const { data } = await api.get("/attachments.json");
        return data;
    },
    getDialogs: async () => {
        const { data } = await api.get("/dialogs.json");
        return data;
    },
    getMessages: async () => {
        const { data } = await api.get("/messages.json");
        return data;
    }
};
