const base = import.meta.env.BASE_URL;

export const navItems = [
  {
    key: "chats",
    label: "Чаты",
    icon: `${base}icons/chat.svg`,
    activeIcon: `${base}icons/chat-active.svg`,
  },
  {
    key: "contacts",
    label: "Контакты",
    icon: `${base}icons/users.svg`,
    activeIcon: `${base}icons/users-active.svg`,
  },
  {
    key: "settings",
    label: "Настройки",
    icon: `${base}icons/settings.svg`,
    activeIcon: `${base}icons/settings-active.svg`,
  },
] as const;