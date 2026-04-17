import chat from '@/icons/chat.svg'
import chatActive from '@/icons/chat-active.svg'
import users from '@/icons/users.svg'
import usersActive from '@/icons/users-active.svg'
import settings from '@/icons/settings.svg'
import settingsActive from '@/icons/settings-active.svg'

export const navItems = [
  {
    key: "chats",
    label: "Чаты",
    icon: chat,
    activeIcon: chatActive,
  },
  {
    key: "contacts",
    label: "Контакты",
    icon: users,
    activeIcon: usersActive,
  },
  {
    key: "settings",
    label: "Настройки",
    icon: settings,
    activeIcon: settingsActive,
  },
] as const;