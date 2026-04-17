import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatList } from "@/widgets/ChatList/ChatList";
import { MessageList } from "@/widgets/MessageList/MessageList";
import { ChatInput } from "@/widgets/ChatInput/ChatInput";
import { chatApi } from "@/shared/api/chatApi";
const CURRENT_USER_ID = 1;
const FAVORITES_DIALOG_ID = 0;
const FAVORITES_DIALOG_NAME = "Избранное";
const USERS_STORAGE_KEY = "constructive.app.users";
const DIALOGS_STORAGE_KEY = "constructive.app.dialogs";
const MESSAGES_STORAGE_KEY = "constructive.app.messages";
const CONTACTS_STORAGE_KEY = "constructive.app.contacts";
const AUTH_USERS_KEY = "constructive.auth.users";
const AUTH_SESSION_KEY = "constructive.auth.session";
const FAVORITES_ENABLED_KEY = "constructive.settings.favorites.enabled";
const THEME_MODE_KEY = "constructive.settings.theme.mode";
const LOCAL_NAMES_KEY = "constructive.contacts.local-names";
const MAX_MEDIA_SIZE_BYTES = 50 * 1024 * 1024;
const readStoredJson = (key) => {
    if (typeof window === "undefined")
        return null;
    try {
        const rawValue = window.localStorage.getItem(key);
        return rawValue ? JSON.parse(rawValue) : null;
    }
    catch {
        return null;
    }
};
const readStoredBoolean = (key, fallback) => {
    if (typeof window === "undefined")
        return fallback;
    const rawValue = window.localStorage.getItem(key);
    if (rawValue === null)
        return fallback;
    return rawValue === "true";
};
const getStoredThemeMode = () => {
    if (typeof window === "undefined")
        return "system";
    const rawValue = window.localStorage.getItem(THEME_MODE_KEY);
    if (rawValue === "system" || rawValue === "light" || rawValue === "blue" || rawValue === "dark" || rawValue === "glass") {
        return rawValue;
    }
    return "system";
};
const normalizeCustomId = (value) => value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
const resolveTheme = (themeMode) => {
    if (themeMode === "light" || themeMode === "blue" || themeMode === "dark" || themeMode === "glass") {
        return themeMode;
    }
    if (typeof window === "undefined")
        return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};
const ensureAppUser = (user) => ({
    ...user,
    login: "login" in user && user.login ? user.login : user.username,
    generatedId: "generatedId" in user && user.generatedId ? user.generatedId : `${100000000 + user.user_id}`,
    customId: "customId" in user ? user.customId : null,
    avatar: "avatar" in user ? user.avatar : null,
});
const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
});
const compressImageFile = async (file) => {
    if (!file.type.startsWith("image/"))
        return file;
    const image = new Image();
    image.src = await readFileAsDataUrl(file);
    await new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Не удалось загрузить изображение"));
    });
    const canvas = document.createElement("canvas");
    const maxSide = 1920;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
        return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/webp", 0.82);
    });
    if (!blob || blob.size >= file.size)
        return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.webp`, {
        type: "image/webp",
        lastModified: Date.now(),
    });
};
const createAttachmentDraft = async (file, uploadMode) => {
    const preparedFile = uploadMode === "compressed" && file.type.startsWith("image/")
        ? await compressImageFile(file)
        : file;
    const sentAsFile = uploadMode === "original";
    const preview = URL.createObjectURL(preparedFile);
    const qualities = preparedFile.type.startsWith("video/")
        ? [{ label: "Original", url: preview }]
        : undefined;
    return {
        id: `${preparedFile.name}-${preparedFile.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        name: preparedFile.name,
        type: preparedFile.type || "application/octet-stream",
        preview,
        size: preparedFile.size,
        uploadMode,
        sentAsFile,
        serverName: `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        qualities,
    };
};
const getDialogKind = (dialog) => {
    if (dialog.dialog_id === FAVORITES_DIALOG_ID)
        return "favorites";
    return dialog.user_ids.length > 2 ? "group" : "direct";
};
const ensureFavoritesDialog = (dialogs) => {
    const hasFavorites = dialogs.some((dialog) => dialog.dialog_id === FAVORITES_DIALOG_ID);
    if (hasFavorites)
        return dialogs;
    return [
        {
            dialog_id: FAVORITES_DIALOG_ID,
            dialog_name: FAVORITES_DIALOG_NAME,
            user_ids: [CURRENT_USER_ID],
            pinned: [CURRENT_USER_ID],
            attachment_id: null,
            kind: "favorites",
            customName: FAVORITES_DIALOG_NAME,
            customPhoto: null,
            adminUserId: CURRENT_USER_ID,
            manualUnread: false,
        },
        ...dialogs,
    ];
};
export const ChatPage = () => {
    const { data: baseUsers = [], isPending: usersPending } = useQuery({
        queryKey: ["users"],
        queryFn: chatApi.getUsers,
    });
    const { data: baseDialogs = [], isPending: dialogsPending } = useQuery({
        queryKey: ["dialogs"],
        queryFn: chatApi.getDialogs,
    });
    const { data: baseMessages = [], isPending: messagesPending } = useQuery({
        queryKey: ["messages"],
        queryFn: chatApi.getMessages,
    });
    const { data: attachments = [], isPending: attachmentsPending } = useQuery({
        queryKey: ["attachments"],
        queryFn: chatApi.getAttachments,
    });
    const [authSession, setAuthSession] = useState(undefined);
    const [favoritesEnabled, setFavoritesEnabled] = useState(() => readStoredBoolean(FAVORITES_ENABLED_KEY, true));
    const [themeMode, setThemeMode] = useState(getStoredThemeMode);
    const [localNames, setLocalNames] = useState(() => readStoredJson(LOCAL_NAMES_KEY) ?? {});
    const [composerError, setComposerError] = useState("");
    const initialUsers = useMemo(() => (readStoredJson(USERS_STORAGE_KEY) ?? baseUsers.map(ensureAppUser)).map(ensureAppUser), [baseUsers]);
    const initialDialogs = useMemo(() => ensureFavoritesDialog(readStoredJson(DIALOGS_STORAGE_KEY) ??
        baseDialogs.map((dialog) => ({
            ...dialog,
            kind: getDialogKind(dialog),
            customName: null,
            customPhoto: null,
            adminUserId: dialog.user_ids[0] ?? CURRENT_USER_ID,
            manualUnread: false,
        }))), [baseDialogs]);
    const initialMessages = useMemo(() => readStoredJson(MESSAGES_STORAGE_KEY) ??
        baseMessages.map((message) => ({ ...message })), [baseMessages]);
    const initialContacts = useMemo(() => {
        const storedContacts = readStoredJson(CONTACTS_STORAGE_KEY);
        if (storedContacts)
            return storedContacts;
        const currentUser = initialUsers.find((user) => user.user_id === CURRENT_USER_ID);
        return currentUser?.friends_ids ?? [];
    }, [initialUsers]);
    const [users, setUsers] = useState(null);
    const [dialogs, setDialogs] = useState(null);
    const [messages, setMessages] = useState(null);
    const [contacts, setContacts] = useState(null);
    const [dialogId, setDialogId] = useState(null);
    const [draftText, setDraftText] = useState("");
    const [draftFiles, setDraftFiles] = useState([]);
    const [replyToId, setReplyToId] = useState(null);
    const [forwardedMessageId, setForwardedMessageId] = useState(null);
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [profileModal, setProfileModal] = useState(null);
    const [dialogEditorId, setDialogEditorId] = useState(null);
    const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
    const [isCompactLayout, setIsCompactLayout] = useState(false);
    const [isDragOverlayVisible, setIsDragOverlayVisible] = useState(false);
    const dragOverlayCounterRef = useRef(0);
    const resolvedUsers = users ?? initialUsers;
    const resolvedDialogs = dialogs ?? initialDialogs;
    const resolvedMessages = messages ?? initialMessages;
    const resolvedContacts = contacts ?? initialContacts;
    const availableDialogs = useMemo(() => favoritesEnabled
        ? resolvedDialogs
        : resolvedDialogs.filter((dialog) => dialog.dialog_id !== FAVORITES_DIALOG_ID), [favoritesEnabled, resolvedDialogs]);
    const hasStoredBootstrap = Boolean(readStoredJson(USERS_STORAGE_KEY)?.length) ||
        Boolean(readStoredJson(DIALOGS_STORAGE_KEY)?.length);
    const isBootstrapping = !hasStoredBootstrap &&
        (usersPending || dialogsPending || messagesPending || attachmentsPending);
    const activeDialogId = dialogId !== null && availableDialogs.some((dialog) => dialog.dialog_id === dialogId)
        ? dialogId
        : null;
    useLayoutEffect(() => {
        setAuthSession(readStoredJson(AUTH_SESSION_KEY));
    }, []);
    useEffect(() => {
        if (users) {
            window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
        }
    }, [users]);
    useEffect(() => {
        if (dialogs) {
            window.localStorage.setItem(DIALOGS_STORAGE_KEY, JSON.stringify(ensureFavoritesDialog(dialogs)));
        }
    }, [dialogs]);
    useEffect(() => {
        if (messages) {
            window.localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(messages));
        }
    }, [messages]);
    useEffect(() => {
        if (contacts) {
            window.localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
        }
    }, [contacts]);
    useEffect(() => {
        window.localStorage.setItem(FAVORITES_ENABLED_KEY, String(favoritesEnabled));
    }, [favoritesEnabled]);
    useEffect(() => {
        window.localStorage.setItem(THEME_MODE_KEY, themeMode);
        document.documentElement.dataset.themeMode = themeMode;
        document.documentElement.dataset.theme = resolveTheme(themeMode);
    }, [themeMode]);
    useEffect(() => {
        window.localStorage.setItem(LOCAL_NAMES_KEY, JSON.stringify(localNames));
    }, [localNames]);
    useEffect(() => {
        if (themeMode !== "system")
            return;
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            document.documentElement.dataset.theme = resolveTheme("system");
        };
        media.addEventListener("change", handleChange);
        return () => media.removeEventListener("change", handleChange);
    }, [themeMode]);
    useEffect(() => {
        if (dialogId !== null && !availableDialogs.some((dialog) => dialog.dialog_id === dialogId)) {
            setDialogId(null);
        }
    }, [availableDialogs, dialogId]);
    useEffect(() => {
        const updateLayout = () => {
            const isPortrait = window.matchMedia("(orientation: portrait)").matches;
            setIsCompactLayout(window.innerWidth <= 767 || (window.innerWidth <= 1024 && isPortrait));
        };
        updateLayout();
        window.addEventListener("resize", updateLayout);
        return () => window.removeEventListener("resize", updateLayout);
    }, []);
    const currentUser = useMemo(() => resolvedUsers.find((user) => user.user_id === CURRENT_USER_ID) ?? null, [resolvedUsers]);
    const getDisplayName = (userId) => {
        const user = resolvedUsers.find((item) => item.user_id === userId);
        if (!user)
            return "Пользователь";
        return localNames[userId]?.trim() || user.nickname;
    };
    const selectedDialog = useMemo(() => resolvedDialogs.find((dialog) => dialog.dialog_id === activeDialogId) ?? null, [activeDialogId, resolvedDialogs]);
    const selectedMessages = useMemo(() => resolvedMessages
        .filter((message) => message.dialog_id === activeDialogId && !message.deleted)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [activeDialogId, resolvedMessages]);
    const replyMessage = useMemo(() => resolvedMessages.find((message) => message.message_id === replyToId) ?? null, [replyToId, resolvedMessages]);
    const forwardedMessage = useMemo(() => resolvedMessages.find((message) => message.message_id === forwardedMessageId) ?? null, [forwardedMessageId, resolvedMessages]);
    const editingMessage = useMemo(() => resolvedMessages.find((message) => message.message_id === editingMessageId) ?? null, [editingMessageId, resolvedMessages]);
    const dialogBeingEdited = useMemo(() => resolvedDialogs.find((dialog) => dialog.dialog_id === dialogEditorId) ?? null, [dialogEditorId, resolvedDialogs]);
    const getUserById = (userId) => resolvedUsers.find((user) => user.user_id === userId) ?? null;
    const markDialogMessagesAsViewed = (targetDialogId) => {
        setDialogs((currentDialogs) => (currentDialogs ?? resolvedDialogs).map((dialog) => dialog.dialog_id === targetDialogId
            ? {
                ...dialog,
                manualUnread: false,
            }
            : dialog));
        setMessages((currentMessages) => {
            const baseState = currentMessages ?? resolvedMessages;
            let changed = false;
            const nextMessages = baseState.map((message) => {
                if (message.dialog_id !== targetDialogId ||
                    message.user_id === CURRENT_USER_ID ||
                    message.message_status === "viewed") {
                    return message;
                }
                changed = true;
                return {
                    ...message,
                    message_status: "viewed",
                };
            });
            return changed ? nextMessages : baseState;
        });
    };
    const addFilesToDraft = async (incomingFiles, uploadMode) => {
        if (!incomingFiles.length)
            return;
        const filesToProcess = uploadMode === "original" ? incomingFiles.slice(0, 1) : incomingFiles;
        const oversizedFile = filesToProcess.find((file) => file.size > MAX_MEDIA_SIZE_BYTES);
        if (oversizedFile) {
            setComposerError(`Файл "${oversizedFile.name}" превышает лимит 50 МБ.`);
            return;
        }
        const nextDrafts = await Promise.all(filesToProcess.map((file) => createAttachmentDraft(file, uploadMode)));
        setComposerError("");
        setDraftFiles((currentFiles) => [...currentFiles, ...nextDrafts]);
    };
    const removeDraftFile = (attachmentId) => {
        setDraftFiles((currentFiles) => {
            const fileToRemove = currentFiles.find((file) => file.id === attachmentId);
            if (fileToRemove?.preview) {
                URL.revokeObjectURL(fileToRemove.preview);
            }
            return currentFiles.filter((file) => file.id !== attachmentId);
        });
    };
    const resetComposer = () => {
        draftFiles.forEach((file) => {
            if (file.preview) {
                URL.revokeObjectURL(file.preview);
            }
        });
        setDraftText("");
        setDraftFiles([]);
        setReplyToId(null);
        setForwardedMessageId(null);
        setEditingMessageId(null);
        setComposerError("");
    };
    const handleSelectDialog = (nextDialogId) => {
        setDialogId(nextDialogId);
        markDialogMessagesAsViewed(nextDialogId);
    };
    const handleBackToDialogs = () => {
        if (!isCompactLayout)
            return;
        setDialogId(null);
    };
    const handleStartDirectChat = (targetUserId) => {
        const existingDialog = resolvedDialogs.find((dialog) => {
            if (dialog.kind === "group" || dialog.kind === "favorites")
                return false;
            if (dialog.user_ids.length !== 2)
                return false;
            return dialog.user_ids.includes(CURRENT_USER_ID) && dialog.user_ids.includes(targetUserId);
        });
        if (existingDialog) {
            handleSelectDialog(existingDialog.dialog_id);
            return existingDialog.dialog_id;
        }
        const targetUser = getUserById(targetUserId);
        if (!targetUser)
            return null;
        const nextDialogId = resolvedDialogs.length
            ? Math.max(...resolvedDialogs.map((dialog) => dialog.dialog_id)) + 1
            : 1;
        const nextDialog = {
            dialog_id: nextDialogId,
            dialog_name: getDisplayName(targetUserId),
            user_ids: [CURRENT_USER_ID, targetUserId],
            pinned: [],
            attachment_id: targetUser.attachment_id,
            kind: "direct",
            customName: null,
            customPhoto: null,
            adminUserId: CURRENT_USER_ID,
            manualUnread: false,
        };
        setDialogs([nextDialog, ...resolvedDialogs]);
        setDialogId(nextDialogId);
        return nextDialogId;
    };
    const handleAddContact = (targetUserId) => {
        if (!resolvedContacts.includes(targetUserId)) {
            setContacts([...resolvedContacts, targetUserId]);
        }
        setUsers(resolvedUsers.map((user) => user.user_id === CURRENT_USER_ID
            ? {
                ...user,
                friends_ids: user.friends_ids.includes(targetUserId)
                    ? user.friends_ids
                    : [...user.friends_ids, targetUserId],
            }
            : user));
    };
    const handleRemoveContact = (targetUserId) => {
        setContacts(resolvedContacts.filter((contactId) => contactId !== targetUserId));
        setUsers(resolvedUsers.map((user) => user.user_id === CURRENT_USER_ID
            ? {
                ...user,
                friends_ids: user.friends_ids.filter((friendId) => friendId !== targetUserId),
            }
            : user));
    };
    const handleCreateGroupChat = (payload) => {
        const nextDialogId = resolvedDialogs.length
            ? Math.max(...resolvedDialogs.map((dialog) => dialog.dialog_id)) + 1
            : 1;
        const dialogTitle = payload.title.trim() || `Новая группа ${nextDialogId}`;
        const nextDialog = {
            dialog_id: nextDialogId,
            dialog_name: dialogTitle,
            user_ids: [CURRENT_USER_ID, ...payload.memberIds],
            pinned: [],
            attachment_id: null,
            kind: "group",
            customName: dialogTitle,
            customPhoto: payload.photo ?? null,
            adminUserId: CURRENT_USER_ID,
            manualUnread: false,
        };
        setDialogs([nextDialog, ...resolvedDialogs]);
        setDialogId(nextDialogId);
        setIsCreateGroupOpen(false);
    };
    const handleUpdateDialog = (targetDialogId, updates) => {
        setDialogs(ensureFavoritesDialog(resolvedDialogs.map((dialog) => dialog.dialog_id === targetDialogId
            ? {
                ...dialog,
                ...updates,
                dialog_name: updates.customName ?? updates.dialog_name ?? dialog.dialog_name,
            }
            : dialog)));
    };
    const handleDeleteDialog = (targetDialogId) => {
        if (targetDialogId === FAVORITES_DIALOG_ID)
            return;
        const nextDialogs = ensureFavoritesDialog(resolvedDialogs.filter((dialog) => dialog.dialog_id !== targetDialogId));
        setDialogs(nextDialogs);
        setMessages(resolvedMessages.filter((message) => message.dialog_id !== targetDialogId));
        if (activeDialogId === targetDialogId) {
            setDialogId(null);
        }
    };
    const handleClearDialog = (targetDialogId) => {
        setMessages(resolvedMessages.filter((message) => message.dialog_id !== targetDialogId));
        if (activeDialogId === targetDialogId) {
            resetComposer();
        }
    };
    const handleSendMessage = () => {
        if (!activeDialogId)
            return;
        if (!draftText.trim() && !draftFiles.length && !forwardedMessage)
            return;
        if (editingMessageId) {
            setMessages(resolvedMessages.map((message) => message.message_id === editingMessageId
                ? {
                    ...message,
                    message_text: draftText.trim() || message.message_text,
                    edited: true,
                }
                : message));
            resetComposer();
            return;
        }
        const nextMessageId = resolvedMessages.length
            ? Math.max(...resolvedMessages.map((message) => message.message_id)) + 1
            : 1;
        const fallbackForwardText = forwardedMessage ? `Переслано: ${forwardedMessage.message_text}` : "";
        const nextMessage = {
            message_id: nextMessageId,
            dialog_id: activeDialogId,
            user_id: CURRENT_USER_ID,
            message_text: draftText.trim() || fallbackForwardText,
            message_status: "sent",
            attachment_id: null,
            created_at: new Date().toISOString(),
            attachments: draftFiles.map((file) => ({ ...file })),
            replyToId,
            forwardedFromId: forwardedMessageId,
            forwardedFromDialogId: forwardedMessage?.dialog_id ?? null,
            pinned: false,
        };
        setMessages([...resolvedMessages, nextMessage]);
        setDraftText("");
        setDraftFiles([]);
        setReplyToId(null);
        setForwardedMessageId(null);
        setEditingMessageId(null);
        setComposerError("");
    };
    const handleDeleteMessage = (messageId) => {
        const targetMessage = resolvedMessages.find((message) => message.message_id === messageId);
        targetMessage?.attachments?.forEach((attachment) => {
            if (attachment.preview) {
                URL.revokeObjectURL(attachment.preview);
            }
        });
        setMessages(resolvedMessages.filter((message) => message.message_id !== messageId));
        if (replyToId === messageId)
            setReplyToId(null);
        if (forwardedMessageId === messageId)
            setForwardedMessageId(null);
        if (editingMessageId === messageId) {
            setEditingMessageId(null);
            setDraftText("");
        }
    };
    const handleStartEditMessage = (messageId) => {
        const message = resolvedMessages.find((item) => item.message_id === messageId);
        if (!message)
            return;
        setEditingMessageId(messageId);
        setReplyToId(null);
        setForwardedMessageId(null);
        setDraftFiles([]);
        setDraftText(message.message_text);
    };
    const handleTogglePinMessage = (messageId) => {
        setMessages(resolvedMessages.map((message) => message.message_id === messageId
            ? {
                ...message,
                pinned: !message.pinned,
            }
            : message));
    };
    const handleReplyToMessage = (messageId) => {
        setReplyToId(messageId);
        setEditingMessageId(null);
    };
    const handleForwardMessage = (messageId) => {
        setForwardedMessageId(messageId);
        setReplyToId(null);
        setEditingMessageId(null);
    };
    const handleOpenProfile = (userId, targetDialogId) => {
        const user = getUserById(userId);
        if (!user)
            return;
        setProfileModal({
            user,
            dialogId: targetDialogId ?? null,
            isOwnProfile: userId === CURRENT_USER_ID,
        });
    };
    const handleSaveOwnProfile = (payload) => {
        const normalizedCustomId = normalizeCustomId(payload.customId);
        if (normalizedCustomId &&
            resolvedUsers.some((user) => user.user_id !== CURRENT_USER_ID &&
                normalizeCustomId(user.customId ?? "") === normalizedCustomId)) {
            return "Такой публичный ID уже занят";
        }
        const nextUsers = resolvedUsers.map((user) => user.user_id === CURRENT_USER_ID
            ? {
                ...user,
                nickname: payload.nickname.trim() || user.nickname,
                customId: normalizedCustomId || null,
                avatar: payload.avatar,
            }
            : user);
        setUsers(nextUsers);
        if (authSession) {
            const nextSession = {
                ...authSession,
                name: payload.nickname.trim() || authSession.name,
            };
            setAuthSession(nextSession);
            window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(nextSession));
        }
        setProfileModal(null);
        return null;
    };
    const handleSaveLocalName = (userId, value) => {
        const trimmedValue = value.trim();
        const fallbackDisplayName = resolvedUsers.find((user) => user.user_id === userId)?.nickname ?? "Пользователь";
        setLocalNames((currentNames) => ({
            ...currentNames,
            [userId]: trimmedValue,
        }));
        setDialogs((currentDialogs) => (currentDialogs ?? resolvedDialogs).map((dialog) => {
            if (dialog.kind !== "direct" || dialog.customName || !dialog.user_ids.includes(userId)) {
                return dialog;
            }
            return {
                ...dialog,
                dialog_name: trimmedValue || fallbackDisplayName,
            };
        }));
        setProfileModal(null);
    };
    const handleLogout = () => {
        window.localStorage.removeItem(AUTH_SESSION_KEY);
        setAuthSession(null);
        setDialogId(null);
    };
    if (authSession === undefined) {
        return null;
    }
    if (!authSession) {
        return _jsx(AuthScreen, { onAuth: setAuthSession });
    }
    if (isBootstrapping) {
        return (_jsx("div", { className: "chat-page", children: _jsx("div", { className: "chat-loading-state", children: _jsxs("div", { className: "chat-loading-card", children: [_jsx("h2", { children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430" }), _jsx("p", { children: "\u041F\u043E\u0434\u0433\u043E\u0442\u0430\u0432\u043B\u0438\u0432\u0430\u044E \u0447\u0430\u0442\u044B \u0438 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F..." })] }) }) }));
    }
    return (_jsxs("div", { className: `chat-page ${isCompactLayout ? "chat-page-compact" : ""} ${selectedDialog && isCompactLayout ? "show-chat-screen" : "show-list-screen"}`, onDragEnter: (event) => {
            event.preventDefault();
            dragOverlayCounterRef.current += 1;
            if (selectedDialog)
                setIsDragOverlayVisible(true);
        }, onDragOver: (event) => {
            event.preventDefault();
            if (selectedDialog)
                setIsDragOverlayVisible(true);
        }, onDragLeave: (event) => {
            event.preventDefault();
            dragOverlayCounterRef.current = Math.max(0, dragOverlayCounterRef.current - 1);
            if (dragOverlayCounterRef.current === 0) {
                setIsDragOverlayVisible(false);
            }
        }, onDrop: (event) => {
            event.preventDefault();
            dragOverlayCounterRef.current = 0;
            setIsDragOverlayVisible(false);
        }, children: [_jsx(ChatList, { currentUserId: CURRENT_USER_ID, users: resolvedUsers, dialogs: availableDialogs, messages: resolvedMessages, attachments: attachments, contacts: resolvedContacts, selectedDialogId: activeDialogId, isReady: !isBootstrapping, isVisible: !isCompactLayout || !selectedDialog, authSessionName: authSession.name, favoritesEnabled: favoritesEnabled, themeMode: themeMode, getUserDisplayName: getDisplayName, onSelect: handleSelectDialog, onOpenOwnProfile: () => currentUser && setProfileModal({ user: currentUser, isOwnProfile: true }), onOpenUserProfile: handleOpenProfile, onStartDirectChat: handleStartDirectChat, onAddContact: handleAddContact, onRemoveContact: handleRemoveContact, onOpenCreateGroup: () => setIsCreateGroupOpen(true), onDeleteDialog: handleDeleteDialog, onClearDialog: handleClearDialog, onToggleFavoritesEnabled: setFavoritesEnabled, onChangeTheme: setThemeMode, onMarkDialogUnread: (targetDialogId) => handleUpdateDialog(targetDialogId, { manualUnread: true }), onLogout: handleLogout }), _jsx("div", { className: "chat-main", children: selectedDialog ? (_jsxs(_Fragment, { children: [_jsx(MessageList, { currentUserId: CURRENT_USER_ID, dialog: selectedDialog, messages: selectedMessages, allMessages: resolvedMessages, users: resolvedUsers, attachments: attachments, typing: false, getUserDisplayName: getDisplayName, isCompactLayout: isCompactLayout, isDragOverlayVisible: isDragOverlayVisible, onBack: handleBackToDialogs, onDropFiles: async (files, mode) => {
                                await addFilesToDraft(files, mode);
                                setIsDragOverlayVisible(false);
                            }, onDeleteMessage: handleDeleteMessage, onEditMessage: handleStartEditMessage, onTogglePinMessage: handleTogglePinMessage, onReplyToMessage: handleReplyToMessage, onForwardMessage: handleForwardMessage, onOpenProfile: handleOpenProfile, onOpenDialogEditor: setDialogEditorId }), _jsx(ChatInput, { value: draftText, error: composerError, onChange: setDraftText, onSend: handleSendMessage, onAddFiles: addFilesToDraft, attachedFiles: draftFiles, isCompactLayout: isCompactLayout, onRemoveFile: removeDraftFile, replyMessage: replyMessage, forwardedMessage: forwardedMessage, editingMessage: editingMessage, onCancelReply: () => setReplyToId(null), onCancelForward: () => setForwardedMessageId(null), onCancelEdit: () => {
                                setEditingMessageId(null);
                                setDraftText("");
                            } })] })) : (_jsxs("div", { className: "chat-empty-state", children: [_jsx("div", { className: "chat-empty-glow chat-empty-glow-primary" }), _jsx("div", { className: "chat-empty-glow chat-empty-glow-secondary" }), _jsxs("div", { className: "chat-empty-card", children: [_jsx("span", { className: "chat-empty-kicker", children: "\u041A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0442\u0438\u0432\u043D\u044B\u0439/\u041E\u043F\u0442\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u043C\u0435\u0441\u0441\u0435\u043D\u0434\u0436\u0435\u0440" }), _jsx("h2", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0447\u0430\u0442" }), _jsx("p", { children: "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0434\u0438\u0430\u043B\u043E\u0433 \u0441\u043B\u0435\u0432\u0430, \u043D\u0430\u0447\u043D\u0438\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442 \u0447\u0435\u0440\u0435\u0437 \u043F\u043E\u0438\u0441\u043A \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0433\u0440\u0443\u043F\u043F\u0443 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445." })] })] })) }), profileModal && (_jsx(ProfileModal, { profile: profileModal, isContact: resolvedContacts.includes(profileModal.user.user_id), localName: localNames[profileModal.user.user_id] ?? "", onClose: () => setProfileModal(null), onSaveOwnProfile: handleSaveOwnProfile, onSaveLocalName: handleSaveLocalName })), isCreateGroupOpen && (_jsx(CreateGroupModal, { users: resolvedUsers, currentUserId: CURRENT_USER_ID, getUserDisplayName: getDisplayName, onClose: () => setIsCreateGroupOpen(false), onSubmit: handleCreateGroupChat })), dialogBeingEdited && (_jsx(EditDialogModal, { dialog: dialogBeingEdited, users: resolvedUsers, getUserDisplayName: getDisplayName, onClose: () => setDialogEditorId(null), onSubmit: (updates) => {
                    handleUpdateDialog(dialogBeingEdited.dialog_id, updates);
                    setDialogEditorId(null);
                } }))] }));
};
const ProfileModal = ({ profile, isContact, localName, onClose, onSaveOwnProfile, onSaveLocalName, }) => {
    const [nickname, setNickname] = useState(profile.user.nickname);
    const [customId, setCustomId] = useState(profile.user.customId ?? "");
    const [avatar, setAvatar] = useState(profile.user.avatar ?? null);
    const [alias, setAlias] = useState(localName);
    const [error, setError] = useState("");
    const handleAvatarChange = (event) => {
        const file = event.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => setAvatar(typeof reader.result === "string" ? reader.result : null);
        reader.readAsDataURL(file);
    };
    const publicId = profile.user.customId || profile.user.generatedId;
    return (_jsx("div", { className: "app-modal-backdrop", onClick: onClose, children: _jsxs("div", { className: "profile-modal profile-modal-global", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "profile-modal-header", children: [_jsx("h2", { children: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C" }), _jsx("button", { type: "button", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] }), _jsxs("div", { className: "profile-avatar-editor", children: [_jsx("div", { className: "profile-avatar-preview", children: avatar || profile.user.avatar ? (_jsx("img", { src: avatar || profile.user.avatar || "", alt: profile.user.nickname })) : (_jsx("span", { children: profile.user.nickname.slice(0, 1).toUpperCase() })) }), profile.isOwnProfile && (_jsxs("label", { className: "secondary-action profile-avatar-button", children: ["\u0421\u043C\u0435\u043D\u0438\u0442\u044C \u0430\u0432\u0430\u0442\u0430\u0440", _jsx("input", { type: "file", accept: "image/*", onChange: handleAvatarChange, hidden: true })] }))] }), _jsxs("div", { className: "profile-modal-content", children: [_jsxs("div", { className: "profile-modal-row", children: [_jsx("span", { children: "\u0418\u043C\u044F" }), _jsx("strong", { children: profile.user.nickname })] }), _jsxs("div", { className: "profile-modal-row", children: [_jsx("span", { children: "\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 ID" }), _jsxs("strong", { children: ["@", publicId] })] }), _jsxs("div", { className: "profile-modal-row", children: [_jsx("span", { children: "\u0421\u0438\u0441\u0442\u0435\u043C\u043D\u044B\u0439 ID" }), _jsx("strong", { children: profile.user.generatedId })] }), _jsxs("div", { className: "profile-modal-row", children: [_jsx("span", { children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("strong", { children: profile.user.user_status })] }), !profile.isOwnProfile && (_jsxs("div", { className: "profile-modal-row", children: [_jsx("span", { children: "\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u044B" }), _jsx("strong", { children: isContact ? "В контактах" : "Не добавлен" })] }))] }), profile.isOwnProfile ? (_jsxs("form", { className: "profile-form", onSubmit: (event) => {
                        event.preventDefault();
                        const nextError = onSaveOwnProfile({ nickname, customId, avatar });
                        if (nextError)
                            setError(nextError);
                    }, children: [_jsx("input", { className: "modal-input", value: nickname, onChange: (event) => setNickname(event.target.value), placeholder: "\u0412\u0430\u0448\u0435 \u0438\u043C\u044F" }), _jsx("input", { className: "modal-input", value: customId, onChange: (event) => setCustomId(event.target.value), placeholder: "\u041A\u0430\u0441\u0442\u043E\u043C\u043D\u044B\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 ID" }), error && _jsx("div", { className: "auth-error", children: error }), _jsx("button", { type: "submit", className: "primary-action", children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C" })] })) : (_jsxs("div", { className: "profile-form", children: [_jsx("input", { className: "modal-input", value: alias, onChange: (event) => setAlias(event.target.value), placeholder: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0435 \u0438\u043C\u044F \u0434\u043B\u044F \u0441\u0435\u0431\u044F" }), _jsx("button", { type: "button", className: "primary-action", onClick: () => onSaveLocalName(profile.user.user_id, alias), children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0435 \u0438\u043C\u044F" })] }))] }) }));
};
const AuthScreen = ({ onAuth, }) => {
    const [mode, setMode] = useState("login");
    const [name, setName] = useState("");
    const [login, setLogin] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const handleSubmit = (event) => {
        event.preventDefault();
        const users = readStoredJson(AUTH_USERS_KEY) ?? [];
        if (mode === "register") {
            const normalizedLogin = normalizeCustomId(login);
            if (!normalizedLogin) {
                setError("Укажите логин");
                return;
            }
            if (users.some((user) => user.email === email.trim() || user.login === normalizedLogin)) {
                setError("Пользователь с таким email или логином уже существует");
                return;
            }
            const nextUser = {
                name: name.trim() || normalizedLogin,
                login: normalizedLogin,
                email: email.trim(),
                password,
            };
            const nextUsers = [...users, nextUser];
            window.localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(nextUsers));
            window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ name: nextUser.name, email: nextUser.email }));
            onAuth({ name: nextUser.name, email: nextUser.email });
            return;
        }
        const identity = email.trim().toLowerCase();
        const existingUser = users.find((user) => (user.email === identity || user.login === identity) && user.password === password);
        if (!existingUser) {
            setError("Неверный email, логин или пароль");
            return;
        }
        window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ name: existingUser.name, email: existingUser.email }));
        onAuth({ name: existingUser.name, email: existingUser.email });
    };
    return (_jsx("div", { className: "chat-page auth-page", children: _jsxs("form", { className: "auth-card", onSubmit: handleSubmit, children: [_jsx("h2", { children: mode === "login" ? "Вход" : "Регистрация" }), _jsx("p", { children: mode === "login" ? "Войдите по email или логину" : "Создайте локальный аккаунт" }), mode === "register" && (_jsxs(_Fragment, { children: [_jsx("input", { value: name, onChange: (event) => setName(event.target.value), placeholder: "\u0418\u043C\u044F" }), _jsx("input", { value: login, onChange: (event) => setLogin(event.target.value), placeholder: "\u041B\u043E\u0433\u0438\u043D" })] })), _jsx("input", { value: email, onChange: (event) => setEmail(event.target.value), placeholder: mode === "login" ? "Email или логин" : "Email" }), _jsx("input", { type: "password", value: password, onChange: (event) => setPassword(event.target.value), placeholder: "\u041F\u0430\u0440\u043E\u043B\u044C" }), error && _jsx("div", { className: "auth-error", children: error }), error && _jsx("div", { className: "auth-error", children: error }), _jsx("button", { type: "submit", className: "primary-action auth-submit", children: mode === "login" ? "Войти" : "Зарегистрироваться" }), _jsx("button", { type: "button", className: "auth-switch", onClick: () => {
                        setError("");
                        setMode((currentMode) => (currentMode === "login" ? "register" : "login"));
                    }, children: mode === "login" ? "Если у вас нет аккаунта, то Вы можете зарегистрироваться, нажав сюда!" : "У меня уже есть аккаунт!" })] }) }));
};
const CreateGroupModal = ({ users, currentUserId, getUserDisplayName, onClose, onSubmit, }) => {
    const [title, setTitle] = useState("");
    const [photo, setPhoto] = useState(null);
    const [memberIds, setMemberIds] = useState([]);
    const availableUsers = users.filter((user) => user.user_id !== currentUserId);
    const toggleMember = (userId) => {
        setMemberIds((currentIds) => currentIds.includes(userId)
            ? currentIds.filter((id) => id !== userId)
            : [...currentIds, userId]);
    };
    const handlePhotoChange = (event) => {
        const file = event.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => setPhoto(typeof reader.result === "string" ? reader.result : null);
        reader.readAsDataURL(file);
    };
    return (_jsx("div", { className: "app-modal-backdrop", onClick: onClose, children: _jsxs("div", { className: "dialog-editor-modal", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "profile-modal-header", children: [_jsx("h2", { children: "\u041D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442" }), _jsx("button", { type: "button", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] }), _jsx("input", { className: "modal-input", value: title, onChange: (event) => setTitle(event.target.value), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0447\u0430\u0442\u0430" }), _jsxs("label", { className: "modal-upload", children: [_jsx("span", { children: "\u0410\u0432\u0430\u0442\u0430\u0440 \u0447\u0430\u0442\u0430" }), _jsx("input", { type: "file", accept: "image/*", onChange: handlePhotoChange })] }), _jsx("div", { className: "dialog-admin-note", children: "\u0412\u044B \u0431\u0443\u0434\u0435\u0442\u0435 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u043E\u043C \u044D\u0442\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u044B." }), _jsx("div", { className: "member-picker", children: availableUsers.map((user) => (_jsxs("label", { className: "member-picker-item", children: [_jsx("input", { type: "checkbox", checked: memberIds.includes(user.user_id), onChange: () => toggleMember(user.user_id) }), _jsx("span", { children: getUserDisplayName(user.user_id) })] }, user.user_id))) }), _jsx("button", { type: "button", className: "primary-action", disabled: !memberIds.length, onClick: () => onSubmit({ title, memberIds, photo }), children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0447\u0430\u0442" })] }) }));
};
const EditDialogModal = ({ dialog, users, getUserDisplayName, onClose, onSubmit, }) => {
    const [title, setTitle] = useState(dialog.customName ?? dialog.dialog_name);
    const [photo, setPhoto] = useState(dialog.customPhoto ?? null);
    const [adminUserId, setAdminUserId] = useState(dialog.adminUserId ?? dialog.user_ids[0] ?? CURRENT_USER_ID);
    const handlePhotoChange = (event) => {
        const file = event.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => setPhoto(typeof reader.result === "string" ? reader.result : null);
        reader.readAsDataURL(file);
    };
    return (_jsx("div", { className: "app-modal-backdrop", onClick: onClose, children: _jsxs("div", { className: "dialog-editor-modal", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "profile-modal-header", children: [_jsx("h2", { children: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0434\u0438\u0430\u043B\u043E\u0433\u0430" }), _jsx("button", { type: "button", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] }), _jsx("input", { className: "modal-input", value: title, onChange: (event) => setTitle(event.target.value), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0447\u0430\u0442\u0430" }), _jsxs("label", { className: "modal-upload", children: [_jsx("span", { children: "\u0410\u0432\u0430\u0442\u0430\u0440 \u0447\u0430\u0442\u0430" }), _jsx("input", { type: "file", accept: "image/*", onChange: handlePhotoChange })] }), dialog.kind === "group" && (_jsx("div", { className: "member-picker", children: users
                        .filter((user) => dialog.user_ids.includes(user.user_id))
                        .map((user) => (_jsxs("div", { className: "member-picker-item member-picker-static", children: [_jsx("span", { children: getUserDisplayName(user.user_id) }), adminUserId === user.user_id ? (_jsx("span", { className: "member-role-badge", children: "\u0410\u0434\u043C\u0438\u043D" })) : (_jsx("button", { type: "button", className: "secondary-action member-role-button", onClick: () => setAdminUserId(user.user_id), children: "\u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0430\u0434\u043C\u0438\u043D\u043E\u043C" }))] }, user.user_id))) })), _jsx("button", { type: "button", className: "primary-action", onClick: () => onSubmit({
                        customName: title,
                        customPhoto: photo,
                        dialog_name: title,
                        adminUserId,
                    }), children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F" })] }) }));
};
