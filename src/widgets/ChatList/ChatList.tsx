import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { Attachment } from "@/shared/api/chatApi";
import { navItems } from "@/shared/config/navItems";
import type { AppDialog, AppMessage, AppUser, ThemeMode } from "@/shared/types/chat";

type Mode = "chats" | "contacts" | "settings";
type PinnedOverrides = Record<number, boolean>;

type DialogContextMenuState = {
  dialogId: number;
  x: number;
  y: number;
} | null;

type ContactContextMenuState = {
  userId: number;
  x: number;
  y: number;
} | null;

const FAVORITES_DIALOG_ID = 0;
const CHAT_LIST_WIDTH_KEY = "constructive.chatList.width";
const PINNED_DIALOGS_KEY = "constructive.chatList.pinned";
const PINNED_DIALOG_ORDER_KEY = "constructive.chatList.pinnedOrder";
const MUTED_DIALOGS_KEY = "constructive.chatList.muted";
const READ_DIALOGS_KEY = "constructive.chatList.read";
const MIN_CHAT_LIST_WIDTH = 250;
const MAX_CHAT_LIST_WIDTH = 600;
const DEFAULT_CHAT_LIST_WIDTH = 400;

const T = {
  searchPlaceholder: "Поиск или @username",
  inContacts: "В контактах",
  add: "Добавить",
  openChat: "Открыть чат",
  usersNotFound: "Пользователи не найдены",
  chatsNotFound: "Чаты не найдены",
  youPrefix: "Вы: ",
  pinned: "Закреплен",
  muted: "Без звука",
  settings: "Настройки",
  settingsDescription: "Профиль, управление избранным и быстрые действия над мессенджером.",
  loggedInAs: "Вы вошли как",
  accountDescription: "Аккаунт и основные настройки приложения.",
  profile: "Профиль",
  logout: "Выйти",
  newGroup: "Новый групповой чат",
  newGroupDescription: "Создать чат с несколькими людьми, названием и фотографией.",
  sidebarWidth: "Ширина панели",
  widthDescription: "Текущая ширина списка:",
  favorites: "Избранное",
  favoritesDescription: "Избранный чат нельзя удалить или открепить. Его можно только очистить или скрыть.",
  favoritesVisible: "Показывать избранное",
  favoritesHidden: "Избранное скрыто",
  clearFavorites: "Очистить избранное",
  markRead: "Отметить как прочитанный",
  unpin: "Открепить чат",
  pin: "Закрепить чат",
  enableSound: "Включить звук",
  disableSound: "Выключить звук",
  deleteChat: "Удалить чат",
  clearChat: "Очистить чат",
  removeFriend: "Удалить из друзей",
  photo: "Фотография",
  video: "Видео",
  file: "Файл",
  noMessages: "Сообщений пока нет",
  message: "Сообщение",
  theme: "Тема",
  systemTheme: "Системная",
  lightTheme: "Светлая",
  blueTheme: "Синяя",
  darkTheme: "Темная",
  glassTheme: "Стекло",
} as const;

const themeLabels: Record<ThemeMode, string> = {
  system: T.systemTheme,
  light: T.lightTheme,
  blue: T.blueTheme,
  dark: T.darkTheme,
  glass: T.glassTheme,
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const readStoredNumber = (key: string, fallback: number) => {
  if (typeof window === "undefined") return fallback;
  const rawValue = window.localStorage.getItem(key);
  const parsedValue = rawValue ? Number(rawValue) : Number.NaN;
  return Number.isFinite(parsedValue) ? clamp(parsedValue, MIN_CHAT_LIST_WIDTH, MAX_CHAT_LIST_WIDTH) : fallback;
};

const readStoredArray = (key: string) => {
  if (typeof window === "undefined") return [] as number[];
  try {
    const rawValue = window.localStorage.getItem(key);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue) ? parsedValue.filter((value): value is number => typeof value === "number") : [];
  } catch {
    return [] as number[];
  }
};

const readStoredPinnedOverrides = () => {
  if (typeof window === "undefined") return {} as PinnedOverrides;
  try {
    const rawValue = window.localStorage.getItem(PINNED_DIALOGS_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};
    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) return {} as PinnedOverrides;
    return Object.entries(parsedValue).reduce<PinnedOverrides>((accumulator, [key, value]) => {
      const dialogId = Number(key);
      if (Number.isFinite(dialogId) && typeof value === "boolean") accumulator[dialogId] = value;
      return accumulator;
    }, {});
  } catch {
    return {} as PinnedOverrides;
  }
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
};

const formatMessageTime = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 1) return formatTime(iso);
  if (diffDays < 7) return date.toLocaleDateString("ru-RU", { weekday: "short" });
  return date.toLocaleDateString("ru-RU");
};

const getAttachmentPreviewLabel = (message?: AppMessage) => {
  if (!message?.attachments?.length) return "";
  const hasVideo = message.attachments.some((attachment) => attachment.type.startsWith("video/"));
  const hasImage = message.attachments.some((attachment) => attachment.type.startsWith("image/"));
  if (hasVideo) return T.video;
  if (hasImage) return T.photo;
  return T.file;
};

const buildMessagePreview = (message: AppMessage | undefined, senderPrefix: string) => {
  if (!message) return T.noMessages;
  const attachmentLabel = getAttachmentPreviewLabel(message);
  const text = message.message_text.trim();
  if (text && attachmentLabel) return `${senderPrefix}${attachmentLabel}: ${text}`;
  if (text) return `${senderPrefix}${text}`;
  if (attachmentLabel) return `${senderPrefix}${attachmentLabel}`;
  return `${senderPrefix}${T.message}`;
};

export const ChatList = ({
  currentUserId,
  users,
  dialogs,
  messages,
  attachments,
  contacts,
  selectedDialogId,
  isReady,
  isVisible,
  authSessionName,
  favoritesEnabled,
  themeMode,
  getUserDisplayName,
  onSelect,
  onOpenOwnProfile,
  onOpenUserProfile,
  onStartDirectChat,
  onAddContact,
  onRemoveContact,
  onOpenCreateGroup,
  onDeleteDialog,
  onClearDialog,
  onToggleFavoritesEnabled,
  onChangeTheme,
  onMarkDialogUnread,
  onLogout,
}: {
  currentUserId: number;
  users: AppUser[];
  dialogs: AppDialog[];
  messages: AppMessage[];
  attachments: Attachment[];
  contacts: number[];
  selectedDialogId: number | null;
  isReady: boolean;
  isVisible: boolean;
  authSessionName: string;
  favoritesEnabled: boolean;
  themeMode: ThemeMode;
  getUserDisplayName: (userId: number) => string;
  onSelect: (dialogId: number) => void;
  onOpenOwnProfile: () => void;
  onOpenUserProfile: (userId: number, dialogId?: number | null) => void;
  onStartDirectChat: (userId: number) => number | null;
  onAddContact: (userId: number) => void;
  onRemoveContact: (userId: number) => void;
  onOpenCreateGroup: () => void;
  onDeleteDialog: (dialogId: number) => void;
  onClearDialog: (dialogId: number) => void;
  onToggleFavoritesEnabled: (enabled: boolean) => void;
  onChangeTheme: (theme: ThemeMode) => void;
  onMarkDialogUnread: (dialogId: number) => void;
  onLogout: () => void;
}) => {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("chats");
  const [prevMode, setPrevMode] = useState<Mode>("chats");
  const [chatListWidth, setChatListWidth] = useState<number>(readStoredNumber(CHAT_LIST_WIDTH_KEY, DEFAULT_CHAT_LIST_WIDTH));
  const [pinnedOverrides, setPinnedOverrides] = useState<PinnedOverrides>(() => readStoredPinnedOverrides());
  const [pinnedOrder, setPinnedOrder] = useState<number[]>(() => readStoredArray(PINNED_DIALOG_ORDER_KEY));
  const [mutedDialogIds, setMutedDialogIds] = useState<number[]>(() => readStoredArray(MUTED_DIALOGS_KEY));
  const [readDialogIds, setReadDialogIds] = useState<number[]>(() => readStoredArray(READ_DIALOGS_KEY));
  const [dialogContextMenu, setDialogContextMenu] = useState<DialogContextMenuState>(null);
  const [contactContextMenu, setContactContextMenu] = useState<ContactContextMenuState>(null);
  const [indicatorReady, setIndicatorReady] = useState(false);
  const [draggedPinnedDialogId, setDraggedPinnedDialogId] = useState<number | null>(null);

  const storedWidthRef = useRef<number>(readStoredNumber(CHAT_LIST_WIDTH_KEY, DEFAULT_CHAT_LIST_WIDTH));
  const chatListRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const modeRef = useRef<Mode>(mode);
  const frameRef = useRef<number | null>(null);
  const isFirstIndicatorPaint = useRef(true);

  const persistArray = useCallback((key: string, value: number[]) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, []);

  const messagesByDialog = useMemo(() => {
    const map = new Map<number, AppMessage[]>();
    messages.forEach((message) => {
      if (message.deleted) return;
      if (!map.has(message.dialog_id)) map.set(message.dialog_id, []);
      map.get(message.dialog_id)?.push(message);
    });
    return map;
  }, [messages]);

  const getAvatarPath = useCallback((dialog: AppDialog) => {
    const fallbackAvatar = `${import.meta.env.BASE_URL}images/avatar.png`;

    if (dialog.customPhoto) return dialog.customPhoto;

    if (dialog.attachment_id) {
      return (
        attachments.find((attachment) => attachment.attachment_id === dialog.attachment_id)?.attachment_path ??
        fallbackAvatar
      );
    }

    if (dialog.kind === "direct") {
      const otherUser = users.find(
        (user) => dialog.user_ids.includes(user.user_id) && user.user_id !== currentUserId
      );

      if (otherUser?.avatar) return otherUser.avatar;

      if (otherUser?.attachment_id) {
        return (
          attachments.find((attachment) => attachment.attachment_id === otherUser.attachment_id)?.attachment_path ??
          fallbackAvatar
        );
      }
    }

    return fallbackAvatar;
  }, [attachments, currentUserId, users]);

  const getOtherUser = useCallback((dialog: AppDialog) => {
    if (dialog.kind === "group" || dialog.kind === "favorites") return null;
    return users.find((user) => dialog.user_ids.includes(user.user_id) && user.user_id !== currentUserId) ?? null;
  }, [currentUserId, users]);

  const getDialogTitle = useCallback((dialog: AppDialog) => {
    if (dialog.customName) return dialog.customName;
    if (dialog.kind === "direct") {
      const otherUser = getOtherUser(dialog);
      if (otherUser) return getUserDisplayName(otherUser.user_id);
    }
    return dialog.dialog_name;
  }, [getOtherUser, getUserDisplayName]);

  const isDialogPinned = useCallback((dialog: AppDialog) => {
    if (dialog.dialog_id === FAVORITES_DIALOG_ID) return true;
    const overrideValue = pinnedOverrides[dialog.dialog_id];
    if (typeof overrideValue === "boolean") return overrideValue;
    return dialog.pinned.includes(currentUserId);
  }, [currentUserId, pinnedOverrides]);

  const normalizedSearch = search.toLowerCase().trim();
  const isUserSearch = normalizedSearch.startsWith("@");
  const userSearchValue = normalizedSearch.replace(/^@/, "");

  const suggestedUsers = useMemo(() => {
    if (!userSearchValue) return [];
    return users.filter((user) => user.user_id !== currentUserId && (
      getUserDisplayName(user.user_id).toLowerCase().includes(userSearchValue) || user.username.toLowerCase().includes(userSearchValue)
    ));
  }, [currentUserId, getUserDisplayName, userSearchValue, users]);

  const pinnedOrderIndex = useMemo(() => new Map(pinnedOrder.map((dialogId, index) => [dialogId, index])), [pinnedOrder]);

  const visibleDialogs = useMemo(() => {
      const filteredDialogs = dialogs.filter((dialog) => {
        if (!normalizedSearch || isUserSearch) return true;
        const dialogMessages = messagesByDialog.get(dialog.dialog_id) || [];
      return getDialogTitle(dialog).toLowerCase().includes(normalizedSearch)
        || dialogMessages.some((message) => message.message_text.toLowerCase().includes(normalizedSearch));
    });

    return [...filteredDialogs].sort((a, b) => {
      const aPinned = isDialogPinned(a);
      const bPinned = isDialogPinned(b);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (aPinned && bPinned) {
        if (a.dialog_id === FAVORITES_DIALOG_ID && b.dialog_id !== FAVORITES_DIALOG_ID) return -1;
        if (b.dialog_id === FAVORITES_DIALOG_ID && a.dialog_id !== FAVORITES_DIALOG_ID) return 1;
        const aOrder = pinnedOrderIndex.get(a.dialog_id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = pinnedOrderIndex.get(b.dialog_id) ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
      }
      const aLast = messagesByDialog.get(a.dialog_id)?.slice(-1)[0];
      const bLast = messagesByDialog.get(b.dialog_id)?.slice(-1)[0];
      const aTime = aLast ? new Date(aLast.created_at).getTime() : 0;
      const bTime = bLast ? new Date(bLast.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [dialogs, isDialogPinned, isUserSearch, messagesByDialog, normalizedSearch, pinnedOrderIndex]);

  const updateIndicator = useCallback((skipAnimation = false) => {
    const index = navItems.findIndex((item) => item.key === modeRef.current);
    if (index === -1) return;
    const button = btnRefs.current[index];
    const indicator = indicatorRef.current;
    if (!button || !indicator) return;
    if (skipAnimation) indicator.classList.remove("ready");
    indicator.style.transform = `translateX(${button.offsetLeft}px)`;
    indicator.style.width = `${button.offsetWidth}px`;
    indicator.style.opacity = "1";
    if (skipAnimation || isFirstIndicatorPaint.current) {
      requestAnimationFrame(() => {
        indicator.classList.add("ready");
        setIndicatorReady(true);
        isFirstIndicatorPaint.current = false;
      });
      return;
    }
    indicator.classList.add("ready");
    setIndicatorReady(true);
  }, []);

  const scheduleIndicatorUpdate = useCallback((skipAnimation = false) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      updateIndicator(skipAnimation);
    });
  }, [updateIndicator]);

  const applyChatListWidth = useCallback((nextWidth: number, options?: { immediate?: boolean; persist?: boolean }) => {
    const width = clamp(nextWidth, MIN_CHAT_LIST_WIDTH, MAX_CHAT_LIST_WIDTH);
    const nextScale = 0.72 + ((width - MIN_CHAT_LIST_WIDTH) / (MAX_CHAT_LIST_WIDTH - MIN_CHAT_LIST_WIDTH)) * 0.28;
    storedWidthRef.current = width;
    setChatListWidth(width);
    if (chatListRef.current) {
      chatListRef.current.style.width = `${width}px`;
      chatListRef.current.style.setProperty("--chat-list-width", `${width}px`);
      chatListRef.current.style.setProperty("--nav-scale", nextScale.toFixed(3));
    }
    if (options?.persist) window.localStorage.setItem(CHAT_LIST_WIDTH_KEY, String(width));
    if (options?.immediate) {
      updateIndicator(true);
      return;
    }
    scheduleIndicatorUpdate();
  }, [scheduleIndicatorUpdate, updateIndicator]);

  const handleMouseDown = () => {
    isResizing.current = true;
    setDialogContextMenu(null);
    setContactContextMenu(null);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    chatListRef.current?.classList.add("is-resizing");
  };

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isResizing.current) return;
    applyChatListWidth(event.clientX, { immediate: true });
  }, [applyChatListWidth]);

  const handleMouseUp = useCallback(() => {
    if (!isResizing.current) return;
    isResizing.current = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    chatListRef.current?.classList.remove("is-resizing");
    applyChatListWidth(storedWidthRef.current, { immediate: true, persist: true });
  }, [applyChatListWidth]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const resizeObserver = new ResizeObserver(() => scheduleIndicatorUpdate(isFirstIndicatorPaint.current));
    resizeObserver.observe(nav);
    btnRefs.current.forEach((button) => { if (button) resizeObserver.observe(button); });
    return () => {
      resizeObserver.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [scheduleIndicatorUpdate]);

  useLayoutEffect(() => {
    modeRef.current = mode;
    const width = storedWidthRef.current;
    const nextScale = 0.72 + ((width - MIN_CHAT_LIST_WIDTH) / (MAX_CHAT_LIST_WIDTH - MIN_CHAT_LIST_WIDTH)) * 0.28;
    setChatListWidth(width);
    if (chatListRef.current) {
      chatListRef.current.style.width = `${width}px`;
      chatListRef.current.style.setProperty("--chat-list-width", `${width}px`);
      chatListRef.current.style.setProperty("--nav-scale", nextScale.toFixed(3));
    }
    if (isFirstIndicatorPaint.current) {
      updateIndicator(true);
      return;
    }
    scheduleIndicatorUpdate(false);
  }, [mode, scheduleIndicatorUpdate, updateIndicator]);

  useEffect(() => {
    if (!isVisible) return;
    scheduleIndicatorUpdate(true);
  }, [isVisible, scheduleIndicatorUpdate]);

  useEffect(() => {
    const closeMenus = () => {
      setDialogContextMenu(null);
      setContactContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenus();
    };
    window.addEventListener("click", closeMenus);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenus);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const switchMode = (nextMode: Mode) => {
    if (nextMode === mode) return;
    setPrevMode(mode);
    setMode(nextMode);
  };

  const markDialogAsRead = (dialogId: number) => {
    setReadDialogIds((currentIds) => {
      if (currentIds.includes(dialogId)) return currentIds;
      const nextIds = [...currentIds, dialogId];
      persistArray(READ_DIALOGS_KEY, nextIds);
      return nextIds;
    });
  };

  const togglePinnedDialog = (dialog: AppDialog) => {
    if (dialog.dialog_id === FAVORITES_DIALOG_ID) {
      setDialogContextMenu(null);
      return;
    }
    const nextPinnedValue = !isDialogPinned(dialog);
    setPinnedOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides, [dialog.dialog_id]: nextPinnedValue };
      window.localStorage.setItem(PINNED_DIALOGS_KEY, JSON.stringify(nextOverrides));
      return nextOverrides;
    });
    if (nextPinnedValue) {
      setPinnedOrder((currentOrder) => {
        const nextOrder = currentOrder.filter((dialogId) => dialogId !== dialog.dialog_id).concat(dialog.dialog_id);
        persistArray(PINNED_DIALOG_ORDER_KEY, nextOrder);
        return nextOrder;
      });
    }
    setDialogContextMenu(null);
  };

  const toggleMutedDialog = (dialogId: number) => {
    setMutedDialogIds((currentIds) => {
      const nextIds = currentIds.includes(dialogId) ? currentIds.filter((id) => id !== dialogId) : [...currentIds, dialogId];
      persistArray(MUTED_DIALOGS_KEY, nextIds);
      return nextIds;
    });
    setDialogContextMenu(null);
  };

  const reorderPinnedDialogs = (sourceDialogId: number, targetDialogId: number) => {
    if (sourceDialogId === targetDialogId) return;
    const basePinnedIds = dialogs
      .filter((dialog) => isDialogPinned(dialog) && dialog.dialog_id !== FAVORITES_DIALOG_ID)
      .sort((a, b) => {
        const aOrder = pinnedOrderIndex.get(a.dialog_id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = pinnedOrderIndex.get(b.dialog_id) ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      })
      .map((dialog) => dialog.dialog_id);
    const withoutSource = basePinnedIds.filter((dialogId) => dialogId !== sourceDialogId);
    const targetIndex = withoutSource.indexOf(targetDialogId);
    if (targetIndex === -1) return;
    withoutSource.splice(targetIndex, 0, sourceDialogId);
    setPinnedOrder(withoutSource);
    persistArray(PINNED_DIALOG_ORDER_KEY, withoutSource);
  };

  const openDialogContextMenu = (event: ReactMouseEvent<HTMLDivElement>, dialogId: number) => {
    event.preventDefault();
    setContactContextMenu(null);
    setDialogContextMenu({
      dialogId,
      x: clamp(event.clientX, 12, window.innerWidth - 228),
      y: clamp(event.clientY, 12, window.innerHeight - 272),
    });
  };

  const openContactContextMenu = (event: ReactMouseEvent<HTMLDivElement>, userId: number) => {
    event.preventDefault();
    setDialogContextMenu(null);
    setContactContextMenu({
      userId,
      x: clamp(event.clientX, 12, window.innerWidth - 228),
      y: clamp(event.clientY, 12, window.innerHeight - 132),
    });
  };

  const modeOrder: Record<Mode, number> = { chats: 0, contacts: 1, settings: 2 };
  const getPanelClass = (panelMode: Mode) => {
    if (mode === panelMode) return "panel active-panel";
    if (prevMode === panelMode) {
      const currentIndex = modeOrder[mode];
      const previousIndex = modeOrder[prevMode];
      return currentIndex > previousIndex ? "panel slide-left" : "panel slide-right";
    }
    return "panel";
  };

  const selectedDialog = dialogContextMenu ? dialogs.find((dialog) => dialog.dialog_id === dialogContextMenu.dialogId) ?? null : null;
  const selectedContact = contactContextMenu ? users.find((user) => user.user_id === contactContextMenu.userId) ?? null : null;

  return (
    <div className="chat-list" ref={chatListRef}>
      <div className="chat-list-glow chat-list-glow-primary" />
      <div className="chat-list-glow chat-list-glow-secondary" />
      <div className="chat-search">
        <input type="text" placeholder={T.searchPlaceholder} value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      <div className="chat-list-content">
        <div className={getPanelClass("chats")}>
          {isUserSearch && userSearchValue && (
            <div className="search-users-panel">
              {suggestedUsers.length ? suggestedUsers.map((user) => (
                <div key={user.user_id} className="search-user-card">
                  <div className="search-user-main">
                    <strong>{getUserDisplayName(user.user_id)}</strong>
                    <span>@{user.username}</span>
                  </div>
                  <div className="search-user-actions">
                    <button type="button" className="secondary-action" onClick={() => onAddContact(user.user_id)}>
                      {contacts.includes(user.user_id) ? T.inContacts : T.add}
                    </button>
                    <button type="button" className="primary-action" onClick={() => {
                      const nextDialogId = onStartDirectChat(user.user_id);
                      if (nextDialogId) {
                        onSelect(nextDialogId);
                        markDialogAsRead(nextDialogId);
                      }
                    }}>{T.openChat}</button>
                  </div>
                </div>
              )) : <div className="chat-placeholder compact">{T.usersNotFound}</div>}
            </div>
          )}

          {visibleDialogs.map((dialog) => {
            const dialogMessages = messagesByDialog.get(dialog.dialog_id) || [];
            const lastMessage = dialogMessages[dialogMessages.length - 1];
            const sender = users.find((user) => user.user_id === lastMessage?.user_id);
            const isPinned = isDialogPinned(dialog);
            const isMuted = mutedDialogIds.includes(dialog.dialog_id);
            const otherUser = getOtherUser(dialog);
            const isOnline = otherUser?.user_status === "online";
            const unreadCount = dialog.manualUnread
              ? Math.max(1, dialogMessages.filter((message) => message.message_status !== "viewed" && message.user_id !== currentUserId).length)
              : readDialogIds.includes(dialog.dialog_id)
              ? 0
              : dialogMessages.filter((message) => message.message_status !== "viewed" && message.user_id !== currentUserId).length;
            const senderName = sender ? getUserDisplayName(sender.user_id) : "";
            const prefix = lastMessage ? (lastMessage.user_id === currentUserId ? T.youPrefix : senderName ? `${senderName}: ` : "") : "";
            const lastPreview = buildMessagePreview(lastMessage, prefix);
            const isDraggablePinned = isPinned && dialog.dialog_id !== FAVORITES_DIALOG_ID;

            return (
              <div
                key={dialog.dialog_id}
                draggable={isDraggablePinned}
                onDragStart={() => setDraggedPinnedDialogId(dialog.dialog_id)}
                onDragEnd={() => setDraggedPinnedDialogId(null)}
                onDragOver={(event: DragEvent<HTMLDivElement>) => {
                  if (!draggedPinnedDialogId || !isPinned || dialog.dialog_id === FAVORITES_DIALOG_ID) return;
                  event.preventDefault();
                }}
                onDrop={(event: DragEvent<HTMLDivElement>) => {
                  event.preventDefault();
                  if (!draggedPinnedDialogId || !isPinned || dialog.dialog_id === FAVORITES_DIALOG_ID) return;
                  reorderPinnedDialogs(draggedPinnedDialogId, dialog.dialog_id);
                  setDraggedPinnedDialogId(null);
                }}
                onClick={() => { onSelect(dialog.dialog_id); markDialogAsRead(dialog.dialog_id); }}
                onContextMenu={(event) => openDialogContextMenu(event, dialog.dialog_id)}
                className={`chat-item ${selectedDialogId === dialog.dialog_id ? "active" : ""} ${draggedPinnedDialogId === dialog.dialog_id ? "dragging" : ""}`}
              >
                <div className="chat-avatar-wrap">
                  <img src={getAvatarPath(dialog)} alt={getDialogTitle(dialog)} />
                  {isOnline && <span className="chat-avatar-online" />}
                </div>
                <div className="chat-item-info">
                  <div className="chat-item-top">
                    <span className="dialog-title-wrap">
                      <span className="dialog-name">{getDialogTitle(dialog)}</span>
                      {dialog.kind === "group" && <span className="chat-item-badge">Группа</span>}
                      {isPinned && <span className="chat-item-badge">{T.pinned}</span>}
                      {isMuted && <span className="chat-item-badge muted">{T.muted}</span>}
                    </span>
                    {lastMessage && <span className="time">{formatMessageTime(lastMessage.created_at)}</span>}
                  </div>
                  <div className="chat-item-bottom">
                    <span className="last-text">{lastPreview}</span>
                    {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
                  </div>
                </div>
              </div>
            );
          })}

          {!visibleDialogs.length && !isUserSearch && isReady && <div className="chat-placeholder compact">{T.chatsNotFound}</div>}
        </div>

        <div className={getPanelClass("contacts")}>
          {users.filter((user) => user.user_id !== currentUserId && contacts.includes(user.user_id)).map((user) => {
            const avatarPath = user.attachment_id ? attachments.find((attachment) => attachment.attachment_id === user.attachment_id)?.attachment_path : "/images/avatar.png";
            return (
              <div key={user.user_id} className="chat-item" onContextMenu={(event) => openContactContextMenu(event, user.user_id)} onClick={() => {
                const nextDialogId = onStartDirectChat(user.user_id);
                if (nextDialogId) onSelect(nextDialogId);
              }}>
                <div className="chat-avatar-wrap">
                  <img src={avatarPath || "/images/avatar.png"} alt={user.nickname} />
                  {user.user_status === "online" && <span className="chat-avatar-online" />}
                </div>
                <div className="chat-item-info">
                  <div className="chat-item-top"><span className="dialog-name">{getUserDisplayName(user.user_id)}</span></div>
                  <div className="chat-item-bottom"><span className="last-text">@{user.username}</span></div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={getPanelClass("settings")}>
          <div className="settings-panel">
            <div className="settings-header">
              <h2>{T.settings}</h2>
              <p>{T.settingsDescription}</p>
            </div>
            <div className="settings-account-card">
              <span className="settings-card-title">{T.loggedInAs} {authSessionName}</span>
              <span className="settings-card-description">{T.accountDescription}</span>
              <div className="settings-inline-actions">
                <button type="button" className="primary-action secondary-action" onClick={onOpenOwnProfile}>{T.profile}</button>
                <button type="button" className="primary-action" onClick={onLogout}>{T.logout}</button>
              </div>
            </div>
            <div className="settings-list">
              <button type="button" className="settings-card" onClick={onOpenOwnProfile}>
                <span className="settings-card-title">Имя, ID и аватар</span>
                <span className="settings-card-description">Открыть редактирование вашего профиля.</span>
              </button>
              <button type="button" className="settings-card" onClick={onOpenCreateGroup}>
                <span className="settings-card-title">{T.newGroup}</span>
                <span className="settings-card-description">{T.newGroupDescription}</span>
              </button>
              <div className="settings-card settings-card-static">
                <span className="settings-card-title">{T.theme}</span>
                <span className="settings-card-description">Системная, светлая, синяя, темная или стеклянная.</span>
                <div className="theme-switcher">
                  {(["system", "light", "blue", "dark", "glass"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`theme-option ${themeMode === item ? "active" : ""}`}
                      onClick={() => onChangeTheme(item)}
                    >
                      {themeLabels[item]}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="settings-card" onClick={() => applyChatListWidth(DEFAULT_CHAT_LIST_WIDTH, { immediate: true, persist: true })}>
                <span className="settings-card-title">{T.sidebarWidth}</span>
                <span className="settings-card-description">{T.widthDescription} {chatListWidth}px</span>
              </button>
              <div className="settings-card settings-card-static">
                <span className="settings-card-title">{T.favorites}</span>
                <span className="settings-card-description">{T.favoritesDescription}</span>
                <label className="settings-toggle">
                  <span>{favoritesEnabled ? T.favoritesVisible : T.favoritesHidden}</span>
                  <button type="button" className={`toggle-switch ${favoritesEnabled ? "active" : ""}`} onClick={() => onToggleFavoritesEnabled(!favoritesEnabled)} aria-pressed={favoritesEnabled}><span /></button>
                </label>
                {favoritesEnabled && <button type="button" className="primary-action secondary-action settings-inline-button" onClick={() => onClearDialog(FAVORITES_DIALOG_ID)}>{T.clearFavorites}</button>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="chat-list-resizer" onMouseDown={handleMouseDown} />
      <div className="chat-bottom-nav" ref={navRef}>
        <div ref={indicatorRef} className={`nav-indicator ${indicatorReady ? "ready" : ""}`} />
        {navItems.map((item, index) => {
          const isActive = mode === item.key;
          return (
            <button key={item.key} type="button" ref={(element) => { btnRefs.current[index] = element; }} onClick={() => switchMode(item.key as Mode)} className={`nav-item ${isActive ? "active" : ""}`}>
              <span className="nav-icon" style={{ maskImage: `url(${isActive ? item.activeIcon : item.icon})`, WebkitMaskImage: `url(${isActive ? item.activeIcon : item.icon})`, backgroundColor: isActive ? "var(--nav-icon-active-color)" : "var(--nav-icon-color)" }} />
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>

      {dialogContextMenu && selectedDialog && (
        <div className="chat-context-menu" style={{ left: dialogContextMenu.x, top: dialogContextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <div className="chat-context-menu-title">{getDialogTitle(selectedDialog)}</div>
          <button type="button" onClick={() => { onSelect(selectedDialog.dialog_id); setDialogContextMenu(null); }}>{T.openChat}</button>
          {selectedDialog.kind === "direct" && (
            <button
              type="button"
              onClick={() => {
                const otherUserId = selectedDialog.user_ids.find((id) => id !== currentUserId);
                if (otherUserId) onOpenUserProfile(otherUserId, selectedDialog.dialog_id);
                setDialogContextMenu(null);
              }}
            >
              Профиль собеседника
            </button>
          )}
          {selectedDialog.dialog_id !== FAVORITES_DIALOG_ID && <button type="button" onClick={() => togglePinnedDialog(selectedDialog)}>{isDialogPinned(selectedDialog) ? T.unpin : T.pin}</button>}
          <button type="button" onClick={() => markDialogAsRead(selectedDialog.dialog_id)}>{T.markRead}</button>
          <button type="button" onClick={() => { onMarkDialogUnread(selectedDialog.dialog_id); setDialogContextMenu(null); }}>Отметить непрочитанным</button>
          {selectedDialog.dialog_id === FAVORITES_DIALOG_ID ? (
            <button type="button" onClick={() => { onClearDialog(selectedDialog.dialog_id); setDialogContextMenu(null); }}>{T.clearChat}</button>
          ) : (
            <>
              <button type="button" onClick={() => toggleMutedDialog(selectedDialog.dialog_id)}>{mutedDialogIds.includes(selectedDialog.dialog_id) ? T.enableSound : T.disableSound}</button>
              <button type="button" className="danger" onClick={() => { onDeleteDialog(selectedDialog.dialog_id); setDialogContextMenu(null); }}>{T.deleteChat}</button>
            </>
          )}
        </div>
      )}

      {contactContextMenu && selectedContact && (
        <div className="chat-context-menu" style={{ left: contactContextMenu.x, top: contactContextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <div className="chat-context-menu-title">{selectedContact.nickname}</div>
          <button type="button" onClick={() => {
            const nextDialogId = onStartDirectChat(selectedContact.user_id);
            if (nextDialogId) onSelect(nextDialogId);
            setContactContextMenu(null);
          }}>{T.openChat}</button>
          <button type="button" className="danger" onClick={() => { onRemoveContact(selectedContact.user_id); setContactContextMenu(null); }}>{T.removeFriend}</button>
        </div>
      )}
    </div>
  );
};
