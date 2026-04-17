import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatList } from "@/widgets/ChatList/ChatList";
import { MessageList } from "@/widgets/MessageList/MessageList";
import { ChatInput } from "@/widgets/ChatInput/ChatInput";
import { chatApi, type Attachment, type Dialog, type Message, type User } from "@/shared/api/chatApi";
import type {
  AppDialog,
  AppMessage,
  AppUser,
  MessageAttachmentDraft,
  ProfileModalState,
  ThemeMode,
  UploadMode,
} from "@/shared/types/chat";

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

type AuthUser = {
  name: string;
  login: string;
  email: string;
  password: string;
};

type AuthSession = {
  name: string;
  email: string;
};

type LocalNamesMap = Record<number, string>;

const readStoredJson = <T,>(key: string): T | null => {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : null;
  } catch {
    return null;
  }
};

const readStoredBoolean = (key: string, fallback: boolean) => {
  if (typeof window === "undefined") return fallback;

  const rawValue = window.localStorage.getItem(key);
  if (rawValue === null) return fallback;

  return rawValue === "true";
};

const getStoredThemeMode = (): ThemeMode => {
  if (typeof window === "undefined") return "system";
  const rawValue = window.localStorage.getItem(THEME_MODE_KEY);
  if (rawValue === "system" || rawValue === "light" || rawValue === "blue" || rawValue === "dark" || rawValue === "glass") {
    return rawValue;
  }
  return "system";
};

const normalizeCustomId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const resolveTheme = (themeMode: ThemeMode) => {
  if (themeMode === "light" || themeMode === "blue" || themeMode === "dark" || themeMode === "glass") {
    return themeMode;
  }
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const ensureAppUser = (user: User | AppUser): AppUser => ({
  ...user,
  login: "login" in user && user.login ? user.login : user.username,
  generatedId: "generatedId" in user && user.generatedId ? user.generatedId : `${100000000 + user.user_id}`,
  customId: "customId" in user ? user.customId : null,
  avatar: "avatar" in user ? user.avatar : null,
});

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });

const compressImageFile = async (file: File) => {
  if (!file.type.startsWith("image/")) return file;

  const image = new Image();
  image.src = await readFileAsDataUrl(file);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Не удалось загрузить изображение"));
  });

  const canvas = document.createElement("canvas");
  const maxSide = 1920;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", 0.82);
  });
  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.webp`, {
    type: "image/webp",
    lastModified: Date.now(),
  });
};

const createAttachmentDraft = async (file: File, uploadMode: UploadMode): Promise<MessageAttachmentDraft> => {
  const preparedFile =
    uploadMode === "compressed" && file.type.startsWith("image/")
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

const getDialogKind = (dialog: Dialog | AppDialog): AppDialog["kind"] => {
  if (dialog.dialog_id === FAVORITES_DIALOG_ID) return "favorites";
  return dialog.user_ids.length > 2 ? "group" : "direct";
};

const ensureFavoritesDialog = (dialogs: AppDialog[]): AppDialog[] => {
  const hasFavorites = dialogs.some((dialog) => dialog.dialog_id === FAVORITES_DIALOG_ID);
  if (hasFavorites) return dialogs;

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
  const { data: baseUsers = [], isPending: usersPending } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: chatApi.getUsers,
  });
  const { data: baseDialogs = [], isPending: dialogsPending } = useQuery<Dialog[]>({
    queryKey: ["dialogs"],
    queryFn: chatApi.getDialogs,
  });
  const { data: baseMessages = [], isPending: messagesPending } = useQuery<Message[]>({
    queryKey: ["messages"],
    queryFn: chatApi.getMessages,
  });
  const { data: attachments = [], isPending: attachmentsPending } = useQuery<Attachment[]>({
    queryKey: ["attachments"],
    queryFn: chatApi.getAttachments,
  });

  const [authSession, setAuthSession] = useState<AuthSession | null | undefined>(undefined);
  const [favoritesEnabled, setFavoritesEnabled] = useState(() => readStoredBoolean(FAVORITES_ENABLED_KEY, true));
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode);
  const [localNames, setLocalNames] = useState<LocalNamesMap>(() => readStoredJson<LocalNamesMap>(LOCAL_NAMES_KEY) ?? {});
  const [composerError, setComposerError] = useState("");

  const initialUsers = useMemo(
    () => (readStoredJson<AppUser[]>(USERS_STORAGE_KEY) ?? baseUsers.map(ensureAppUser)).map(ensureAppUser),
    [baseUsers]
  );
  const initialDialogs = useMemo(
    () =>
      ensureFavoritesDialog(
        readStoredJson<AppDialog[]>(DIALOGS_STORAGE_KEY) ??
          baseDialogs.map((dialog): AppDialog => ({
            ...dialog,
            kind: getDialogKind(dialog),
            customName: null,
            customPhoto: null,
            adminUserId: dialog.user_ids[0] ?? CURRENT_USER_ID,
            manualUnread: false,
          }))
      ),
    [baseDialogs]
  );
  const initialMessages = useMemo<AppMessage[]>(
    () =>
      readStoredJson<AppMessage[]>(MESSAGES_STORAGE_KEY) ??
      baseMessages.map((message) => ({ ...message })),
    [baseMessages]
  );
  const initialContacts = useMemo(() => {
    const storedContacts = readStoredJson<number[]>(CONTACTS_STORAGE_KEY);
    if (storedContacts) return storedContacts;

    const currentUser = initialUsers.find((user) => user.user_id === CURRENT_USER_ID);
    return currentUser?.friends_ids ?? [];
  }, [initialUsers]);

  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [dialogs, setDialogs] = useState<AppDialog[] | null>(null);
  const [messages, setMessages] = useState<AppMessage[] | null>(null);
  const [contacts, setContacts] = useState<number[] | null>(null);
  const [dialogId, setDialogId] = useState<number | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftFiles, setDraftFiles] = useState<MessageAttachmentDraft[]>([]);
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [forwardedMessageId, setForwardedMessageId] = useState<number | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [profileModal, setProfileModal] = useState<ProfileModalState | null>(null);
  const [dialogEditorId, setDialogEditorId] = useState<number | null>(null);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [isDragOverlayVisible, setIsDragOverlayVisible] = useState(false);
  const dragOverlayCounterRef = useRef(0);

  const resolvedUsers = users ?? initialUsers;
  const resolvedDialogs = dialogs ?? initialDialogs;
  const resolvedMessages = messages ?? initialMessages;
  const resolvedContacts = contacts ?? initialContacts;
  const availableDialogs = useMemo(
    () =>
      favoritesEnabled
        ? resolvedDialogs
        : resolvedDialogs.filter((dialog) => dialog.dialog_id !== FAVORITES_DIALOG_ID),
    [favoritesEnabled, resolvedDialogs]
  );
  const hasStoredBootstrap =
    Boolean(readStoredJson<User[]>(USERS_STORAGE_KEY)?.length) ||
    Boolean(readStoredJson<AppDialog[]>(DIALOGS_STORAGE_KEY)?.length);
  const isBootstrapping =
    !hasStoredBootstrap &&
    (usersPending || dialogsPending || messagesPending || attachmentsPending);

  const activeDialogId =
    dialogId !== null && availableDialogs.some((dialog) => dialog.dialog_id === dialogId)
      ? dialogId
      : null;

  useLayoutEffect(() => {
    setAuthSession(readStoredJson<AuthSession>(AUTH_SESSION_KEY));
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
    if (themeMode !== "system") return;
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

  const currentUser = useMemo(
    () => resolvedUsers.find((user) => user.user_id === CURRENT_USER_ID) ?? null,
    [resolvedUsers]
  );
  const getDisplayName = (userId: number) => {
    const user = resolvedUsers.find((item) => item.user_id === userId);
    if (!user) return "Пользователь";
    return localNames[userId]?.trim() || user.nickname;
  };
  const selectedDialog = useMemo(
    () => resolvedDialogs.find((dialog) => dialog.dialog_id === activeDialogId) ?? null,
    [activeDialogId, resolvedDialogs]
  );
  const selectedMessages = useMemo(
    () =>
      resolvedMessages
        .filter((message) => message.dialog_id === activeDialogId && !message.deleted)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [activeDialogId, resolvedMessages]
  );
  const replyMessage = useMemo(
    () => resolvedMessages.find((message) => message.message_id === replyToId) ?? null,
    [replyToId, resolvedMessages]
  );
  const forwardedMessage = useMemo(
    () => resolvedMessages.find((message) => message.message_id === forwardedMessageId) ?? null,
    [forwardedMessageId, resolvedMessages]
  );
  const editingMessage = useMemo(
    () => resolvedMessages.find((message) => message.message_id === editingMessageId) ?? null,
    [editingMessageId, resolvedMessages]
  );
  const dialogBeingEdited = useMemo(
    () => resolvedDialogs.find((dialog) => dialog.dialog_id === dialogEditorId) ?? null,
    [dialogEditorId, resolvedDialogs]
  );

  const getUserById = (userId: number) =>
    resolvedUsers.find((user) => user.user_id === userId) ?? null;

  const markDialogMessagesAsViewed = (targetDialogId: number) => {
    setDialogs((currentDialogs) =>
      (currentDialogs ?? resolvedDialogs).map((dialog) =>
        dialog.dialog_id === targetDialogId
          ? {
              ...dialog,
              manualUnread: false,
            }
          : dialog
      )
    );

    setMessages((currentMessages) => {
      const baseState = currentMessages ?? resolvedMessages;
      let changed = false;

      const nextMessages = baseState.map((message) => {
        if (
          message.dialog_id !== targetDialogId ||
          message.user_id === CURRENT_USER_ID ||
          message.message_status === "viewed"
        ) {
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

  const addFilesToDraft = async (incomingFiles: File[], uploadMode: UploadMode) => {
    if (!incomingFiles.length) return;

    const filesToProcess = uploadMode === "original" ? incomingFiles.slice(0, 1) : incomingFiles;

    const oversizedFile = filesToProcess.find((file) => file.size > MAX_MEDIA_SIZE_BYTES);
    if (oversizedFile) {
      setComposerError(`Файл "${oversizedFile.name}" превышает лимит 50 МБ.`);
      return;
    }

    const nextDrafts = await Promise.all(
      filesToProcess.map((file) => createAttachmentDraft(file, uploadMode))
    );
    setComposerError("");
    setDraftFiles((currentFiles) => [...currentFiles, ...nextDrafts]);
  };

  const removeDraftFile = (attachmentId: string) => {
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

  const handleSelectDialog = (nextDialogId: number) => {
    setDialogId(nextDialogId);
    markDialogMessagesAsViewed(nextDialogId);
  };

  const handleBackToDialogs = () => {
    if (!isCompactLayout) return;
    setDialogId(null);
  };

  const handleStartDirectChat = (targetUserId: number) => {
    const existingDialog = resolvedDialogs.find((dialog) => {
      if (dialog.kind === "group" || dialog.kind === "favorites") return false;
      if (dialog.user_ids.length !== 2) return false;

      return dialog.user_ids.includes(CURRENT_USER_ID) && dialog.user_ids.includes(targetUserId);
    });

    if (existingDialog) {
      handleSelectDialog(existingDialog.dialog_id);
      return existingDialog.dialog_id;
    }

    const targetUser = getUserById(targetUserId);
    if (!targetUser) return null;

    const nextDialogId = resolvedDialogs.length
      ? Math.max(...resolvedDialogs.map((dialog) => dialog.dialog_id)) + 1
      : 1;

    const nextDialog: AppDialog = {
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

  const handleAddContact = (targetUserId: number) => {
    if (!resolvedContacts.includes(targetUserId)) {
      setContacts([...resolvedContacts, targetUserId]);
    }

    setUsers(
      resolvedUsers.map((user) =>
        user.user_id === CURRENT_USER_ID
          ? {
              ...user,
              friends_ids: user.friends_ids.includes(targetUserId)
                ? user.friends_ids
                : [...user.friends_ids, targetUserId],
            }
          : user
      )
    );
  };

  const handleRemoveContact = (targetUserId: number) => {
    setContacts(resolvedContacts.filter((contactId) => contactId !== targetUserId));
    setUsers(
      resolvedUsers.map((user) =>
        user.user_id === CURRENT_USER_ID
          ? {
              ...user,
              friends_ids: user.friends_ids.filter((friendId) => friendId !== targetUserId),
            }
          : user
      )
    );
  };

  const handleCreateGroupChat = (payload: {
    title: string;
    memberIds: number[];
    photo?: string | null;
  }) => {
    const nextDialogId = resolvedDialogs.length
      ? Math.max(...resolvedDialogs.map((dialog) => dialog.dialog_id)) + 1
      : 1;
    const dialogTitle = payload.title.trim() || `Новая группа ${nextDialogId}`;

    const nextDialog: AppDialog = {
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

  const handleUpdateDialog = (targetDialogId: number, updates: Partial<AppDialog>) => {
    setDialogs(
      ensureFavoritesDialog(
        resolvedDialogs.map((dialog) =>
          dialog.dialog_id === targetDialogId
            ? {
                ...dialog,
                ...updates,
                dialog_name: updates.customName ?? updates.dialog_name ?? dialog.dialog_name,
              }
            : dialog
        )
      )
    );
  };

  const handleDeleteDialog = (targetDialogId: number) => {
    if (targetDialogId === FAVORITES_DIALOG_ID) return;

    const nextDialogs = ensureFavoritesDialog(
      resolvedDialogs.filter((dialog) => dialog.dialog_id !== targetDialogId)
    );

    setDialogs(nextDialogs);
    setMessages(resolvedMessages.filter((message) => message.dialog_id !== targetDialogId));

    if (activeDialogId === targetDialogId) {
      setDialogId(null);
    }
  };

  const handleClearDialog = (targetDialogId: number) => {
    setMessages(resolvedMessages.filter((message) => message.dialog_id !== targetDialogId));

    if (activeDialogId === targetDialogId) {
      resetComposer();
    }
  };

  const handleSendMessage = () => {
    if (!activeDialogId) return;
    if (!draftText.trim() && !draftFiles.length && !forwardedMessage) return;

    if (editingMessageId) {
      setMessages(
        resolvedMessages.map((message) =>
          message.message_id === editingMessageId
            ? {
                ...message,
                message_text: draftText.trim() || message.message_text,
                edited: true,
              }
            : message
        )
      );

      resetComposer();
      return;
    }

    const nextMessageId = resolvedMessages.length
      ? Math.max(...resolvedMessages.map((message) => message.message_id)) + 1
      : 1;
    const fallbackForwardText = forwardedMessage ? `Переслано: ${forwardedMessage.message_text}` : "";

    const nextMessage: AppMessage = {
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

  const handleDeleteMessage = (messageId: number) => {
    const targetMessage = resolvedMessages.find((message) => message.message_id === messageId);
    targetMessage?.attachments?.forEach((attachment) => {
      if (attachment.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
    });

    setMessages(resolvedMessages.filter((message) => message.message_id !== messageId));

    if (replyToId === messageId) setReplyToId(null);
    if (forwardedMessageId === messageId) setForwardedMessageId(null);

    if (editingMessageId === messageId) {
      setEditingMessageId(null);
      setDraftText("");
    }
  };

  const handleStartEditMessage = (messageId: number) => {
    const message = resolvedMessages.find((item) => item.message_id === messageId);
    if (!message) return;

    setEditingMessageId(messageId);
    setReplyToId(null);
    setForwardedMessageId(null);
    setDraftFiles([]);
    setDraftText(message.message_text);
  };

  const handleTogglePinMessage = (messageId: number) => {
    setMessages(
      resolvedMessages.map((message) =>
        message.message_id === messageId
          ? {
              ...message,
              pinned: !message.pinned,
            }
          : message
      )
    );
  };

  const handleReplyToMessage = (messageId: number) => {
    setReplyToId(messageId);
    setEditingMessageId(null);
  };

  const handleForwardMessage = (messageId: number) => {
    setForwardedMessageId(messageId);
    setReplyToId(null);
    setEditingMessageId(null);
  };

  const handleOpenProfile = (userId: number, targetDialogId?: number | null) => {
    const user = getUserById(userId);
    if (!user) return;

    setProfileModal({
      user,
      dialogId: targetDialogId ?? null,
      isOwnProfile: userId === CURRENT_USER_ID,
    });
  };

  const handleSaveOwnProfile = (payload: {
    nickname: string;
    customId: string;
    avatar: string | null;
  }) => {
    const normalizedCustomId = normalizeCustomId(payload.customId);
    if (
      normalizedCustomId &&
      resolvedUsers.some(
        (user) =>
          user.user_id !== CURRENT_USER_ID &&
          normalizeCustomId(user.customId ?? "") === normalizedCustomId
      )
    ) {
      return "Такой публичный ID уже занят";
    }

    const nextUsers = resolvedUsers.map((user) =>
      user.user_id === CURRENT_USER_ID
        ? {
            ...user,
            nickname: payload.nickname.trim() || user.nickname,
            customId: normalizedCustomId || null,
            avatar: payload.avatar,
          }
        : user
    );
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

  const handleSaveLocalName = (userId: number, value: string) => {
    const trimmedValue = value.trim();
    const fallbackDisplayName =
      resolvedUsers.find((user) => user.user_id === userId)?.nickname ?? "Пользователь";
    setLocalNames((currentNames) => ({
      ...currentNames,
      [userId]: trimmedValue,
    }));
    setDialogs((currentDialogs) =>
      (currentDialogs ?? resolvedDialogs).map((dialog) => {
        if (dialog.kind !== "direct" || dialog.customName || !dialog.user_ids.includes(userId)) {
          return dialog;
        }

        return {
          ...dialog,
          dialog_name: trimmedValue || fallbackDisplayName,
        };
      })
    );
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
    return <AuthScreen onAuth={setAuthSession} />;
  }

  if (isBootstrapping) {
    return (
      <div className="chat-page">
        <div className="chat-loading-state">
          <div className="chat-loading-card">
            <h2>Загрузка</h2>
            <p>Подготавливаю чаты и сообщения...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`chat-page ${isCompactLayout ? "chat-page-compact" : ""} ${selectedDialog && isCompactLayout ? "show-chat-screen" : "show-list-screen"}`}
      onDragEnter={(event) => {
        event.preventDefault();
        dragOverlayCounterRef.current += 1;
        if (selectedDialog) setIsDragOverlayVisible(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (selectedDialog) setIsDragOverlayVisible(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragOverlayCounterRef.current = Math.max(0, dragOverlayCounterRef.current - 1);
        if (dragOverlayCounterRef.current === 0) {
          setIsDragOverlayVisible(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragOverlayCounterRef.current = 0;
        setIsDragOverlayVisible(false);
      }}
    >
      <ChatList
        currentUserId={CURRENT_USER_ID}
        users={resolvedUsers}
        dialogs={availableDialogs}
        messages={resolvedMessages}
        attachments={attachments}
        contacts={resolvedContacts}
        selectedDialogId={activeDialogId}
        isReady={!isBootstrapping}
        isVisible={!isCompactLayout || !selectedDialog}
        authSessionName={authSession.name}
        favoritesEnabled={favoritesEnabled}
        themeMode={themeMode}
        getUserDisplayName={getDisplayName}
        onSelect={handleSelectDialog}
        onOpenOwnProfile={() => currentUser && setProfileModal({ user: currentUser, isOwnProfile: true })}
        onOpenUserProfile={handleOpenProfile}
        onStartDirectChat={handleStartDirectChat}
        onAddContact={handleAddContact}
        onRemoveContact={handleRemoveContact}
        onOpenCreateGroup={() => setIsCreateGroupOpen(true)}
        onDeleteDialog={handleDeleteDialog}
        onClearDialog={handleClearDialog}
        onToggleFavoritesEnabled={setFavoritesEnabled}
        onChangeTheme={setThemeMode}
        onMarkDialogUnread={(targetDialogId) => handleUpdateDialog(targetDialogId, { manualUnread: true })}
        onLogout={handleLogout}
      />

      <div className="chat-main">
        {selectedDialog ? (
          <>
            <MessageList
              currentUserId={CURRENT_USER_ID}
              dialog={selectedDialog}
              messages={selectedMessages}
              allMessages={resolvedMessages}
              users={resolvedUsers}
              attachments={attachments}
              typing={false}
              getUserDisplayName={getDisplayName}
              isCompactLayout={isCompactLayout}
              isDragOverlayVisible={isDragOverlayVisible}
              onBack={handleBackToDialogs}
              onDropFiles={async (files, mode) => {
                await addFilesToDraft(files, mode);
                setIsDragOverlayVisible(false);
              }}
              onDeleteMessage={handleDeleteMessage}
              onEditMessage={handleStartEditMessage}
              onTogglePinMessage={handleTogglePinMessage}
              onReplyToMessage={handleReplyToMessage}
              onForwardMessage={handleForwardMessage}
              onOpenProfile={handleOpenProfile}
              onOpenDialogEditor={setDialogEditorId}
            />
            <ChatInput
              value={draftText}
              error={composerError}
              onChange={setDraftText}
              onSend={handleSendMessage}
              onAddFiles={addFilesToDraft}
              attachedFiles={draftFiles}
              isCompactLayout={isCompactLayout}
              onRemoveFile={removeDraftFile}
              replyMessage={replyMessage}
              forwardedMessage={forwardedMessage}
              editingMessage={editingMessage}
              onCancelReply={() => setReplyToId(null)}
              onCancelForward={() => setForwardedMessageId(null)}
              onCancelEdit={() => {
                setEditingMessageId(null);
                setDraftText("");
              }}
            />
          </>
        ) : (
          <div className="chat-empty-state">
            <div className="chat-empty-glow chat-empty-glow-primary" />
            <div className="chat-empty-glow chat-empty-glow-secondary" />
            <div className="chat-empty-card">
              <span className="chat-empty-kicker">Конструктив мессенджер</span>
              <h2>Выберите чат</h2>
              <p>Откройте диалог слева, начните новый чат через поиск или создайте группу в настройках.</p>
            </div>
          </div>
        )}
      </div>

      {profileModal && (
        <ProfileModal
          profile={profileModal}
          isContact={resolvedContacts.includes(profileModal.user.user_id)}
          localName={localNames[profileModal.user.user_id] ?? ""}
          onClose={() => setProfileModal(null)}
          onSaveOwnProfile={handleSaveOwnProfile}
          onSaveLocalName={handleSaveLocalName}
        />
      )}


      {isCreateGroupOpen && (
        <CreateGroupModal
          users={resolvedUsers}
          currentUserId={CURRENT_USER_ID}
          getUserDisplayName={getDisplayName}
          onClose={() => setIsCreateGroupOpen(false)}
          onSubmit={handleCreateGroupChat}
        />
      )}

      {dialogBeingEdited && (
        <EditDialogModal
          dialog={dialogBeingEdited}
          users={resolvedUsers}
          getUserDisplayName={getDisplayName}
          onClose={() => setDialogEditorId(null)}
          onSubmit={(updates) => {
            handleUpdateDialog(dialogBeingEdited.dialog_id, updates);
            setDialogEditorId(null);
          }}
        />
      )}
    </div>
  );
};

const ProfileModal = ({
  profile,
  isContact,
  localName,
  onClose,
  onSaveOwnProfile,
  onSaveLocalName,
}: {
  profile: ProfileModalState;
  isContact: boolean;
  localName: string;
  onClose: () => void;
  onSaveOwnProfile: (payload: {
    nickname: string;
    customId: string;
    avatar: string | null;
  }) => string | null;
  onSaveLocalName: (userId: number, value: string) => void;
}) => {
  const [nickname, setNickname] = useState(profile.user.nickname);
  const [customId, setCustomId] = useState(profile.user.customId ?? "");
  const [avatar, setAvatar] = useState<string | null>(profile.user.avatar ?? null);
  const [alias, setAlias] = useState(localName);
  const [error, setError] = useState("");

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setAvatar(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const publicId = profile.user.customId || profile.user.generatedId;

  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <div className="profile-modal profile-modal-global" onClick={(event) => event.stopPropagation()}>
        <div className="profile-modal-header">
          <h2>Профиль</h2>
          <button type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="profile-avatar-editor">
          <div className="profile-avatar-preview">
            {avatar || profile.user.avatar ? (
              <img src={avatar || profile.user.avatar || ""} alt={profile.user.nickname} />
            ) : (
              <span>{profile.user.nickname.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          {profile.isOwnProfile && (
            <label className="secondary-action profile-avatar-button">
              Сменить аватар
              <input type="file" accept="image/*" onChange={handleAvatarChange} hidden />
            </label>
          )}
        </div>

        <div className="profile-modal-content">
          <div className="profile-modal-row">
            <span>Имя</span>
            <strong>{profile.user.nickname}</strong>
          </div>
          <div className="profile-modal-row">
            <span>Публичный ID</span>
            <strong>@{publicId}</strong>
          </div>
          <div className="profile-modal-row">
            <span>Системный ID</span>
            <strong>{profile.user.generatedId}</strong>
          </div>
          <div className="profile-modal-row">
            <span>Статус</span>
            <strong>{profile.user.user_status}</strong>
          </div>
          {!profile.isOwnProfile && (
            <div className="profile-modal-row">
              <span>Контакты</span>
              <strong>{isContact ? "В контактах" : "Не добавлен"}</strong>
            </div>
          )}
        </div>

        {profile.isOwnProfile ? (
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const nextError = onSaveOwnProfile({ nickname, customId, avatar });
              if (nextError) setError(nextError);
            }}
          >
            <input className="modal-input" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Ваше имя" />
            <input className="modal-input" value={customId} onChange={(event) => setCustomId(event.target.value)} placeholder="Кастомный публичный ID" />
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="primary-action">Сохранить профиль</button>
          </form>
        ) : (
          <div className="profile-form">
            <input className="modal-input" value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Локальное имя для себя" />
            <button type="button" className="primary-action" onClick={() => onSaveLocalName(profile.user.user_id, alias)}>
              Сохранить локальное имя
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const AuthScreen = ({
  onAuth,
}: {
  onAuth: (session: AuthSession) => void;
}) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const users = readStoredJson<AuthUser[]>(AUTH_USERS_KEY) ?? [];

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

      const nextUser: AuthUser = {
        name: name.trim() || normalizedLogin,
        login: normalizedLogin,
        email: email.trim(),
        password,
      };

      const nextUsers = [...users, nextUser];
      window.localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(nextUsers));
      window.localStorage.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({ name: nextUser.name, email: nextUser.email })
      );
      onAuth({ name: nextUser.name, email: nextUser.email });
      return;
    }

    const identity = email.trim().toLowerCase();
    const existingUser = users.find(
      (user) => (user.email === identity || user.login === identity) && user.password === password
    );

    if (!existingUser) {
      setError("Неверный email, логин или пароль");
      return;
    }

    window.localStorage.setItem(
      AUTH_SESSION_KEY,
      JSON.stringify({ name: existingUser.name, email: existingUser.email })
    );
    onAuth({ name: existingUser.name, email: existingUser.email });
  };

  return (
    <div className="chat-page auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>{mode === "login" ? "Вход" : "Регистрация"}</h2>
        <p>{mode === "login" ? "Войдите по email или логину" : "Создайте локальный аккаунт"}</p>

        {mode === "register" && (
          <>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Имя" />
            <input value={login} onChange={(event) => setLogin(event.target.value)} placeholder="Логин" />
          </>
        )}
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder={mode === "login" ? "Email или логин" : "Email"} />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" />

        {error && <div className="auth-error">{error}</div>}
        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="primary-action auth-submit">
          {mode === "login" ? "Войти" : "Зарегистрироваться"}
        </button>

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setError("");
            setMode((currentMode) => (currentMode === "login" ? "register" : "login"));
          }}
        >
          {mode === "login" ? "Если у вас нет аккаунта, то Вы можете зарегистрироваться, нажав сюда!" : "У меня уже есть аккаунт!"}
        </button>
      </form>
    </div>
  );
};

const CreateGroupModal = ({
  users,
  currentUserId,
  getUserDisplayName,
  onClose,
  onSubmit,
}: {
  users: AppUser[];
  currentUserId: number;
  getUserDisplayName: (userId: number) => string;
  onClose: () => void;
  onSubmit: (payload: { title: string; memberIds: number[]; photo?: string | null }) => void;
}) => {
  const [title, setTitle] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<number[]>([]);

  const availableUsers = users.filter((user) => user.user_id !== currentUserId);

  const toggleMember = (userId: number) => {
    setMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((id) => id !== userId)
        : [...currentIds, userId]
    );
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setPhoto(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <div className="dialog-editor-modal" onClick={(event) => event.stopPropagation()}>
        <div className="profile-modal-header">
          <h2>Новый чат</h2>
          <button type="button" onClick={onClose}>Закрыть</button>
        </div>

        <input className="modal-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название чата" />

        <label className="modal-upload">
          <span>Аватар чата</span>
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
        </label>

        <div className="dialog-admin-note">Вы будете администратором этой группы.</div>

        <div className="member-picker">
          {availableUsers.map((user) => (
            <label key={user.user_id} className="member-picker-item">
              <input type="checkbox" checked={memberIds.includes(user.user_id)} onChange={() => toggleMember(user.user_id)} />
              <span>{getUserDisplayName(user.user_id)}</span>
            </label>
          ))}
        </div>

        <button type="button" className="primary-action" disabled={!memberIds.length} onClick={() => onSubmit({ title, memberIds, photo })}>
          Создать чат
        </button>
      </div>
    </div>
  );
};

const EditDialogModal = ({
  dialog,
  users,
  getUserDisplayName,
  onClose,
  onSubmit,
}: {
  dialog: AppDialog;
  users: AppUser[];
  getUserDisplayName: (userId: number) => string;
  onClose: () => void;
  onSubmit: (updates: Partial<AppDialog>) => void;
}) => {
  const [title, setTitle] = useState(dialog.customName ?? dialog.dialog_name);
  const [photo, setPhoto] = useState<string | null>(dialog.customPhoto ?? null);
  const [adminUserId, setAdminUserId] = useState<number | null>(
    dialog.adminUserId ?? dialog.user_ids[0] ?? CURRENT_USER_ID
  );

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setPhoto(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <div className="dialog-editor-modal" onClick={(event) => event.stopPropagation()}>
        <div className="profile-modal-header">
          <h2>Настройки диалога</h2>
          <button type="button" onClick={onClose}>Закрыть</button>
        </div>

        <input className="modal-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название чата" />

        <label className="modal-upload">
          <span>Аватар чата</span>
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
        </label>

        {dialog.kind === "group" && (
          <div className="member-picker">
            {users
              .filter((user) => dialog.user_ids.includes(user.user_id))
              .map((user) => (
                <div key={user.user_id} className="member-picker-item member-picker-static">
                  <span>{getUserDisplayName(user.user_id)}</span>
                  {adminUserId === user.user_id ? (
                    <span className="member-role-badge">Админ</span>
                  ) : (
                    <button
                      type="button"
                      className="secondary-action member-role-button"
                      onClick={() => setAdminUserId(user.user_id)}
                    >
                      Назначить админом
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}

        <button
          type="button"
          className="primary-action"
          onClick={() =>
            onSubmit({
              customName: title,
              customPhoto: photo,
              dialog_name: title,
              adminUserId,
            })
          }
        >
          Сохранить изменения
        </button>
      </div>
    </div>
  );
};

