import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, } from "react";
import { navItems } from "@/shared/config/navItems";
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
};
const themeLabels = {
    system: T.systemTheme,
    light: T.lightTheme,
    blue: T.blueTheme,
    dark: T.darkTheme,
    glass: T.glassTheme,
};
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const readStoredNumber = (key, fallback) => {
    if (typeof window === "undefined")
        return fallback;
    const rawValue = window.localStorage.getItem(key);
    const parsedValue = rawValue ? Number(rawValue) : Number.NaN;
    return Number.isFinite(parsedValue) ? clamp(parsedValue, MIN_CHAT_LIST_WIDTH, MAX_CHAT_LIST_WIDTH) : fallback;
};
const readStoredArray = (key) => {
    if (typeof window === "undefined")
        return [];
    try {
        const rawValue = window.localStorage.getItem(key);
        const parsedValue = rawValue ? JSON.parse(rawValue) : [];
        return Array.isArray(parsedValue) ? parsedValue.filter((value) => typeof value === "number") : [];
    }
    catch {
        return [];
    }
};
const readStoredPinnedOverrides = () => {
    if (typeof window === "undefined")
        return {};
    try {
        const rawValue = window.localStorage.getItem(PINNED_DIALOGS_KEY);
        const parsedValue = rawValue ? JSON.parse(rawValue) : {};
        if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue))
            return {};
        return Object.entries(parsedValue).reduce((accumulator, [key, value]) => {
            const dialogId = Number(key);
            if (Number.isFinite(dialogId) && typeof value === "boolean")
                accumulator[dialogId] = value;
            return accumulator;
        }, {});
    }
    catch {
        return {};
    }
};
const formatTime = (iso) => {
    const date = new Date(iso);
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
};
const formatMessageTime = (iso) => {
    const date = new Date(iso);
    const now = new Date();
    const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 1)
        return formatTime(iso);
    if (diffDays < 7)
        return date.toLocaleDateString("ru-RU", { weekday: "short" });
    return date.toLocaleDateString("ru-RU");
};
const getAttachmentPreviewLabel = (message) => {
    if (!message?.attachments?.length)
        return "";
    const hasVideo = message.attachments.some((attachment) => attachment.type.startsWith("video/"));
    const hasImage = message.attachments.some((attachment) => attachment.type.startsWith("image/"));
    if (hasVideo)
        return T.video;
    if (hasImage)
        return T.photo;
    return T.file;
};
const buildMessagePreview = (message, senderPrefix) => {
    if (!message)
        return T.noMessages;
    const attachmentLabel = getAttachmentPreviewLabel(message);
    const text = message.message_text.trim();
    if (text && attachmentLabel)
        return `${senderPrefix}${attachmentLabel}: ${text}`;
    if (text)
        return `${senderPrefix}${text}`;
    if (attachmentLabel)
        return `${senderPrefix}${attachmentLabel}`;
    return `${senderPrefix}${T.message}`;
};
export const ChatList = ({ currentUserId, users, dialogs, messages, attachments, contacts, selectedDialogId, isReady, isVisible, authSessionName, favoritesEnabled, themeMode, getUserDisplayName, onSelect, onOpenOwnProfile, onOpenUserProfile, onStartDirectChat, onAddContact, onRemoveContact, onOpenCreateGroup, onDeleteDialog, onClearDialog, onToggleFavoritesEnabled, onChangeTheme, onMarkDialogUnread, onLogout, }) => {
    const [search, setSearch] = useState("");
    const [mode, setMode] = useState("chats");
    const [prevMode, setPrevMode] = useState("chats");
    const [chatListWidth, setChatListWidth] = useState(readStoredNumber(CHAT_LIST_WIDTH_KEY, DEFAULT_CHAT_LIST_WIDTH));
    const [pinnedOverrides, setPinnedOverrides] = useState(() => readStoredPinnedOverrides());
    const [pinnedOrder, setPinnedOrder] = useState(() => readStoredArray(PINNED_DIALOG_ORDER_KEY));
    const [mutedDialogIds, setMutedDialogIds] = useState(() => readStoredArray(MUTED_DIALOGS_KEY));
    const [readDialogIds, setReadDialogIds] = useState(() => readStoredArray(READ_DIALOGS_KEY));
    const [dialogContextMenu, setDialogContextMenu] = useState(null);
    const [contactContextMenu, setContactContextMenu] = useState(null);
    const [indicatorReady, setIndicatorReady] = useState(false);
    const [draggedPinnedDialogId, setDraggedPinnedDialogId] = useState(null);
    const storedWidthRef = useRef(readStoredNumber(CHAT_LIST_WIDTH_KEY, DEFAULT_CHAT_LIST_WIDTH));
    const chatListRef = useRef(null);
    const navRef = useRef(null);
    const btnRefs = useRef([]);
    const indicatorRef = useRef(null);
    const isResizing = useRef(false);
    const modeRef = useRef(mode);
    const frameRef = useRef(null);
    const isFirstIndicatorPaint = useRef(true);
    const persistArray = useCallback((key, value) => {
        window.localStorage.setItem(key, JSON.stringify(value));
    }, []);
    const messagesByDialog = useMemo(() => {
        const map = new Map();
        messages.forEach((message) => {
            if (message.deleted)
                return;
            if (!map.has(message.dialog_id))
                map.set(message.dialog_id, []);
            map.get(message.dialog_id)?.push(message);
        });
        return map;
    }, [messages]);
    const getAvatarPath = useCallback((dialog) => {
        if (dialog.customPhoto)
            return dialog.customPhoto;
        if (dialog.attachment_id) {
            return attachments.find((attachment) => attachment.attachment_id === dialog.attachment_id)?.attachment_path ?? "/images/avatar.png";
        }
        if (dialog.kind === "direct") {
            const otherUser = users.find((user) => dialog.user_ids.includes(user.user_id) && user.user_id !== currentUserId);
            if (otherUser?.avatar)
                return otherUser.avatar;
            if (otherUser?.attachment_id) {
                return attachments.find((attachment) => attachment.attachment_id === otherUser.attachment_id)?.attachment_path ?? "/images/avatar.png";
            }
        }
        return "/images/avatar.png";
    }, [attachments, currentUserId, users]);
    const getOtherUser = useCallback((dialog) => {
        if (dialog.kind === "group" || dialog.kind === "favorites")
            return null;
        return users.find((user) => dialog.user_ids.includes(user.user_id) && user.user_id !== currentUserId) ?? null;
    }, [currentUserId, users]);
    const getDialogTitle = useCallback((dialog) => {
        if (dialog.customName)
            return dialog.customName;
        if (dialog.kind === "direct") {
            const otherUser = getOtherUser(dialog);
            if (otherUser)
                return getUserDisplayName(otherUser.user_id);
        }
        return dialog.dialog_name;
    }, [getOtherUser, getUserDisplayName]);
    const isDialogPinned = useCallback((dialog) => {
        if (dialog.dialog_id === FAVORITES_DIALOG_ID)
            return true;
        const overrideValue = pinnedOverrides[dialog.dialog_id];
        if (typeof overrideValue === "boolean")
            return overrideValue;
        return dialog.pinned.includes(currentUserId);
    }, [currentUserId, pinnedOverrides]);
    const normalizedSearch = search.toLowerCase().trim();
    const isUserSearch = normalizedSearch.startsWith("@");
    const userSearchValue = normalizedSearch.replace(/^@/, "");
    const suggestedUsers = useMemo(() => {
        if (!userSearchValue)
            return [];
        return users.filter((user) => user.user_id !== currentUserId && (getUserDisplayName(user.user_id).toLowerCase().includes(userSearchValue) || user.username.toLowerCase().includes(userSearchValue)));
    }, [currentUserId, getUserDisplayName, userSearchValue, users]);
    const pinnedOrderIndex = useMemo(() => new Map(pinnedOrder.map((dialogId, index) => [dialogId, index])), [pinnedOrder]);
    const visibleDialogs = useMemo(() => {
        const filteredDialogs = dialogs.filter((dialog) => {
            if (!normalizedSearch || isUserSearch)
                return true;
            const dialogMessages = messagesByDialog.get(dialog.dialog_id) || [];
            return getDialogTitle(dialog).toLowerCase().includes(normalizedSearch)
                || dialogMessages.some((message) => message.message_text.toLowerCase().includes(normalizedSearch));
        });
        return [...filteredDialogs].sort((a, b) => {
            const aPinned = isDialogPinned(a);
            const bPinned = isDialogPinned(b);
            if (aPinned !== bPinned)
                return aPinned ? -1 : 1;
            if (aPinned && bPinned) {
                if (a.dialog_id === FAVORITES_DIALOG_ID && b.dialog_id !== FAVORITES_DIALOG_ID)
                    return -1;
                if (b.dialog_id === FAVORITES_DIALOG_ID && a.dialog_id !== FAVORITES_DIALOG_ID)
                    return 1;
                const aOrder = pinnedOrderIndex.get(a.dialog_id) ?? Number.MAX_SAFE_INTEGER;
                const bOrder = pinnedOrderIndex.get(b.dialog_id) ?? Number.MAX_SAFE_INTEGER;
                if (aOrder !== bOrder)
                    return aOrder - bOrder;
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
        if (index === -1)
            return;
        const button = btnRefs.current[index];
        const indicator = indicatorRef.current;
        if (!button || !indicator)
            return;
        if (skipAnimation)
            indicator.classList.remove("ready");
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
        if (frameRef.current !== null)
            cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            updateIndicator(skipAnimation);
        });
    }, [updateIndicator]);
    const applyChatListWidth = useCallback((nextWidth, options) => {
        const width = clamp(nextWidth, MIN_CHAT_LIST_WIDTH, MAX_CHAT_LIST_WIDTH);
        const nextScale = 0.72 + ((width - MIN_CHAT_LIST_WIDTH) / (MAX_CHAT_LIST_WIDTH - MIN_CHAT_LIST_WIDTH)) * 0.28;
        storedWidthRef.current = width;
        setChatListWidth(width);
        if (chatListRef.current) {
            chatListRef.current.style.width = `${width}px`;
            chatListRef.current.style.setProperty("--chat-list-width", `${width}px`);
            chatListRef.current.style.setProperty("--nav-scale", nextScale.toFixed(3));
        }
        if (options?.persist)
            window.localStorage.setItem(CHAT_LIST_WIDTH_KEY, String(width));
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
    const handleMouseMove = useCallback((event) => {
        if (!isResizing.current)
            return;
        applyChatListWidth(event.clientX, { immediate: true });
    }, [applyChatListWidth]);
    const handleMouseUp = useCallback(() => {
        if (!isResizing.current)
            return;
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
        if (!nav)
            return;
        const resizeObserver = new ResizeObserver(() => scheduleIndicatorUpdate(isFirstIndicatorPaint.current));
        resizeObserver.observe(nav);
        btnRefs.current.forEach((button) => { if (button)
            resizeObserver.observe(button); });
        return () => {
            resizeObserver.disconnect();
            if (frameRef.current !== null)
                cancelAnimationFrame(frameRef.current);
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
        if (!isVisible)
            return;
        scheduleIndicatorUpdate(true);
    }, [isVisible, scheduleIndicatorUpdate]);
    useEffect(() => {
        const closeMenus = () => {
            setDialogContextMenu(null);
            setContactContextMenu(null);
        };
        const closeOnEscape = (event) => {
            if (event.key === "Escape")
                closeMenus();
        };
        window.addEventListener("click", closeMenus);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("click", closeMenus);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, []);
    const switchMode = (nextMode) => {
        if (nextMode === mode)
            return;
        setPrevMode(mode);
        setMode(nextMode);
    };
    const markDialogAsRead = (dialogId) => {
        setReadDialogIds((currentIds) => {
            if (currentIds.includes(dialogId))
                return currentIds;
            const nextIds = [...currentIds, dialogId];
            persistArray(READ_DIALOGS_KEY, nextIds);
            return nextIds;
        });
    };
    const togglePinnedDialog = (dialog) => {
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
    const toggleMutedDialog = (dialogId) => {
        setMutedDialogIds((currentIds) => {
            const nextIds = currentIds.includes(dialogId) ? currentIds.filter((id) => id !== dialogId) : [...currentIds, dialogId];
            persistArray(MUTED_DIALOGS_KEY, nextIds);
            return nextIds;
        });
        setDialogContextMenu(null);
    };
    const reorderPinnedDialogs = (sourceDialogId, targetDialogId) => {
        if (sourceDialogId === targetDialogId)
            return;
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
        if (targetIndex === -1)
            return;
        withoutSource.splice(targetIndex, 0, sourceDialogId);
        setPinnedOrder(withoutSource);
        persistArray(PINNED_DIALOG_ORDER_KEY, withoutSource);
    };
    const openDialogContextMenu = (event, dialogId) => {
        event.preventDefault();
        setContactContextMenu(null);
        setDialogContextMenu({
            dialogId,
            x: clamp(event.clientX, 12, window.innerWidth - 228),
            y: clamp(event.clientY, 12, window.innerHeight - 272),
        });
    };
    const openContactContextMenu = (event, userId) => {
        event.preventDefault();
        setDialogContextMenu(null);
        setContactContextMenu({
            userId,
            x: clamp(event.clientX, 12, window.innerWidth - 228),
            y: clamp(event.clientY, 12, window.innerHeight - 132),
        });
    };
    const modeOrder = { chats: 0, contacts: 1, settings: 2 };
    const getPanelClass = (panelMode) => {
        if (mode === panelMode)
            return "panel active-panel";
        if (prevMode === panelMode) {
            const currentIndex = modeOrder[mode];
            const previousIndex = modeOrder[prevMode];
            return currentIndex > previousIndex ? "panel slide-left" : "panel slide-right";
        }
        return "panel";
    };
    const selectedDialog = dialogContextMenu ? dialogs.find((dialog) => dialog.dialog_id === dialogContextMenu.dialogId) ?? null : null;
    const selectedContact = contactContextMenu ? users.find((user) => user.user_id === contactContextMenu.userId) ?? null : null;
    return (_jsxs("div", { className: "chat-list", ref: chatListRef, children: [_jsx("div", { className: "chat-list-glow chat-list-glow-primary" }), _jsx("div", { className: "chat-list-glow chat-list-glow-secondary" }), _jsx("div", { className: "chat-search", children: _jsx("input", { type: "text", placeholder: T.searchPlaceholder, value: search, onChange: (event) => setSearch(event.target.value) }) }), _jsxs("div", { className: "chat-list-content", children: [_jsxs("div", { className: getPanelClass("chats"), children: [isUserSearch && userSearchValue && (_jsx("div", { className: "search-users-panel", children: suggestedUsers.length ? suggestedUsers.map((user) => (_jsxs("div", { className: "search-user-card", children: [_jsxs("div", { className: "search-user-main", children: [_jsx("strong", { children: getUserDisplayName(user.user_id) }), _jsxs("span", { children: ["@", user.username] })] }), _jsxs("div", { className: "search-user-actions", children: [_jsx("button", { type: "button", className: "secondary-action", onClick: () => onAddContact(user.user_id), children: contacts.includes(user.user_id) ? T.inContacts : T.add }), _jsx("button", { type: "button", className: "primary-action", onClick: () => {
                                                        const nextDialogId = onStartDirectChat(user.user_id);
                                                        if (nextDialogId) {
                                                            onSelect(nextDialogId);
                                                            markDialogAsRead(nextDialogId);
                                                        }
                                                    }, children: T.openChat })] })] }, user.user_id))) : _jsx("div", { className: "chat-placeholder compact", children: T.usersNotFound }) })), visibleDialogs.map((dialog) => {
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
                                return (_jsxs("div", { draggable: isDraggablePinned, onDragStart: () => setDraggedPinnedDialogId(dialog.dialog_id), onDragEnd: () => setDraggedPinnedDialogId(null), onDragOver: (event) => {
                                        if (!draggedPinnedDialogId || !isPinned || dialog.dialog_id === FAVORITES_DIALOG_ID)
                                            return;
                                        event.preventDefault();
                                    }, onDrop: (event) => {
                                        event.preventDefault();
                                        if (!draggedPinnedDialogId || !isPinned || dialog.dialog_id === FAVORITES_DIALOG_ID)
                                            return;
                                        reorderPinnedDialogs(draggedPinnedDialogId, dialog.dialog_id);
                                        setDraggedPinnedDialogId(null);
                                    }, onClick: () => { onSelect(dialog.dialog_id); markDialogAsRead(dialog.dialog_id); }, onContextMenu: (event) => openDialogContextMenu(event, dialog.dialog_id), className: `chat-item ${selectedDialogId === dialog.dialog_id ? "active" : ""} ${draggedPinnedDialogId === dialog.dialog_id ? "dragging" : ""}`, children: [_jsxs("div", { className: "chat-avatar-wrap", children: [_jsx("img", { src: getAvatarPath(dialog), alt: getDialogTitle(dialog) }), isOnline && _jsx("span", { className: "chat-avatar-online" })] }), _jsxs("div", { className: "chat-item-info", children: [_jsxs("div", { className: "chat-item-top", children: [_jsxs("span", { className: "dialog-title-wrap", children: [_jsx("span", { className: "dialog-name", children: getDialogTitle(dialog) }), dialog.kind === "group" && _jsx("span", { className: "chat-item-badge", children: "\u0413\u0440\u0443\u043F\u043F\u0430" }), isPinned && _jsx("span", { className: "chat-item-badge", children: T.pinned }), isMuted && _jsx("span", { className: "chat-item-badge muted", children: T.muted })] }), lastMessage && _jsx("span", { className: "time", children: formatMessageTime(lastMessage.created_at) })] }), _jsxs("div", { className: "chat-item-bottom", children: [_jsx("span", { className: "last-text", children: lastPreview }), unreadCount > 0 && _jsx("span", { className: "unread-badge", children: unreadCount })] })] })] }, dialog.dialog_id));
                            }), !visibleDialogs.length && !isUserSearch && isReady && _jsx("div", { className: "chat-placeholder compact", children: T.chatsNotFound })] }), _jsx("div", { className: getPanelClass("contacts"), children: users.filter((user) => user.user_id !== currentUserId && contacts.includes(user.user_id)).map((user) => {
                            const avatarPath = user.attachment_id ? attachments.find((attachment) => attachment.attachment_id === user.attachment_id)?.attachment_path : "/images/avatar.png";
                            return (_jsxs("div", { className: "chat-item", onContextMenu: (event) => openContactContextMenu(event, user.user_id), onClick: () => {
                                    const nextDialogId = onStartDirectChat(user.user_id);
                                    if (nextDialogId)
                                        onSelect(nextDialogId);
                                }, children: [_jsxs("div", { className: "chat-avatar-wrap", children: [_jsx("img", { src: avatarPath || "/images/avatar.png", alt: user.nickname }), user.user_status === "online" && _jsx("span", { className: "chat-avatar-online" })] }), _jsxs("div", { className: "chat-item-info", children: [_jsx("div", { className: "chat-item-top", children: _jsx("span", { className: "dialog-name", children: getUserDisplayName(user.user_id) }) }), _jsx("div", { className: "chat-item-bottom", children: _jsxs("span", { className: "last-text", children: ["@", user.username] }) })] })] }, user.user_id));
                        }) }), _jsx("div", { className: getPanelClass("settings"), children: _jsxs("div", { className: "settings-panel", children: [_jsxs("div", { className: "settings-header", children: [_jsx("h2", { children: T.settings }), _jsx("p", { children: T.settingsDescription })] }), _jsxs("div", { className: "settings-account-card", children: [_jsxs("span", { className: "settings-card-title", children: [T.loggedInAs, " ", authSessionName] }), _jsx("span", { className: "settings-card-description", children: T.accountDescription }), _jsxs("div", { className: "settings-inline-actions", children: [_jsx("button", { type: "button", className: "primary-action secondary-action", onClick: onOpenOwnProfile, children: T.profile }), _jsx("button", { type: "button", className: "primary-action", onClick: onLogout, children: T.logout })] })] }), _jsxs("div", { className: "settings-list", children: [_jsxs("button", { type: "button", className: "settings-card", onClick: onOpenOwnProfile, children: [_jsx("span", { className: "settings-card-title", children: "\u0418\u043C\u044F, ID \u0438 \u0430\u0432\u0430\u0442\u0430\u0440" }), _jsx("span", { className: "settings-card-description", children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0432\u0430\u0448\u0435\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u044F." })] }), _jsxs("button", { type: "button", className: "settings-card", onClick: onOpenCreateGroup, children: [_jsx("span", { className: "settings-card-title", children: T.newGroup }), _jsx("span", { className: "settings-card-description", children: T.newGroupDescription })] }), _jsxs("div", { className: "settings-card settings-card-static", children: [_jsx("span", { className: "settings-card-title", children: T.theme }), _jsx("span", { className: "settings-card-description", children: "\u0421\u0438\u0441\u0442\u0435\u043C\u043D\u0430\u044F, \u0441\u0432\u0435\u0442\u043B\u0430\u044F, \u0441\u0438\u043D\u044F\u044F, \u0442\u0435\u043C\u043D\u0430\u044F \u0438\u043B\u0438 \u0441\u0442\u0435\u043A\u043B\u044F\u043D\u043D\u0430\u044F." }), _jsx("div", { className: "theme-switcher", children: ["system", "light", "blue", "dark", "glass"].map((item) => (_jsx("button", { type: "button", className: `theme-option ${themeMode === item ? "active" : ""}`, onClick: () => onChangeTheme(item), children: themeLabels[item] }, item))) })] }), _jsxs("button", { type: "button", className: "settings-card", onClick: () => applyChatListWidth(DEFAULT_CHAT_LIST_WIDTH, { immediate: true, persist: true }), children: [_jsx("span", { className: "settings-card-title", children: T.sidebarWidth }), _jsxs("span", { className: "settings-card-description", children: [T.widthDescription, " ", chatListWidth, "px"] })] }), _jsxs("div", { className: "settings-card settings-card-static", children: [_jsx("span", { className: "settings-card-title", children: T.favorites }), _jsx("span", { className: "settings-card-description", children: T.favoritesDescription }), _jsxs("label", { className: "settings-toggle", children: [_jsx("span", { children: favoritesEnabled ? T.favoritesVisible : T.favoritesHidden }), _jsx("button", { type: "button", className: `toggle-switch ${favoritesEnabled ? "active" : ""}`, onClick: () => onToggleFavoritesEnabled(!favoritesEnabled), "aria-pressed": favoritesEnabled, children: _jsx("span", {}) })] }), favoritesEnabled && _jsx("button", { type: "button", className: "primary-action secondary-action settings-inline-button", onClick: () => onClearDialog(FAVORITES_DIALOG_ID), children: T.clearFavorites })] })] })] }) })] }), _jsx("div", { className: "chat-list-resizer", onMouseDown: handleMouseDown }), _jsxs("div", { className: "chat-bottom-nav", ref: navRef, children: [_jsx("div", { ref: indicatorRef, className: `nav-indicator ${indicatorReady ? "ready" : ""}` }), navItems.map((item, index) => {
                        const isActive = mode === item.key;
                        return (_jsxs("button", { type: "button", ref: (element) => { btnRefs.current[index] = element; }, onClick: () => switchMode(item.key), className: `nav-item ${isActive ? "active" : ""}`, children: [_jsx("span", { className: "nav-icon", style: { maskImage: `url(${isActive ? item.activeIcon : item.icon})`, WebkitMaskImage: `url(${isActive ? item.activeIcon : item.icon})`, backgroundColor: isActive ? "var(--nav-icon-active-color)" : "var(--nav-icon-color)" } }), _jsx("span", { className: "nav-label", children: item.label })] }, item.key));
                    })] }), dialogContextMenu && selectedDialog && (_jsxs("div", { className: "chat-context-menu", style: { left: dialogContextMenu.x, top: dialogContextMenu.y }, onClick: (event) => event.stopPropagation(), children: [_jsx("div", { className: "chat-context-menu-title", children: getDialogTitle(selectedDialog) }), _jsx("button", { type: "button", onClick: () => { onSelect(selectedDialog.dialog_id); setDialogContextMenu(null); }, children: T.openChat }), selectedDialog.kind === "direct" && (_jsx("button", { type: "button", onClick: () => {
                            const otherUserId = selectedDialog.user_ids.find((id) => id !== currentUserId);
                            if (otherUserId)
                                onOpenUserProfile(otherUserId, selectedDialog.dialog_id);
                            setDialogContextMenu(null);
                        }, children: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0441\u043E\u0431\u0435\u0441\u0435\u0434\u043D\u0438\u043A\u0430" })), selectedDialog.dialog_id !== FAVORITES_DIALOG_ID && _jsx("button", { type: "button", onClick: () => togglePinnedDialog(selectedDialog), children: isDialogPinned(selectedDialog) ? T.unpin : T.pin }), _jsx("button", { type: "button", onClick: () => markDialogAsRead(selectedDialog.dialog_id), children: T.markRead }), _jsx("button", { type: "button", onClick: () => { onMarkDialogUnread(selectedDialog.dialog_id); setDialogContextMenu(null); }, children: "\u041E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u043C" }), selectedDialog.dialog_id === FAVORITES_DIALOG_ID ? (_jsx("button", { type: "button", onClick: () => { onClearDialog(selectedDialog.dialog_id); setDialogContextMenu(null); }, children: T.clearChat })) : (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", onClick: () => toggleMutedDialog(selectedDialog.dialog_id), children: mutedDialogIds.includes(selectedDialog.dialog_id) ? T.enableSound : T.disableSound }), _jsx("button", { type: "button", className: "danger", onClick: () => { onDeleteDialog(selectedDialog.dialog_id); setDialogContextMenu(null); }, children: T.deleteChat })] }))] })), contactContextMenu && selectedContact && (_jsxs("div", { className: "chat-context-menu", style: { left: contactContextMenu.x, top: contactContextMenu.y }, onClick: (event) => event.stopPropagation(), children: [_jsx("div", { className: "chat-context-menu-title", children: selectedContact.nickname }), _jsx("button", { type: "button", onClick: () => {
                            const nextDialogId = onStartDirectChat(selectedContact.user_id);
                            if (nextDialogId)
                                onSelect(nextDialogId);
                            setContactContextMenu(null);
                        }, children: T.openChat }), _jsx("button", { type: "button", className: "danger", onClick: () => { onRemoveContact(selectedContact.user_id); setContactContextMenu(null); }, children: T.removeFriend })] }))] }));
};
