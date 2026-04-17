import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Attachment } from "@/shared/api/chatApi";
import type {
  AppDialog,
  AppMessage,
  AppUser,
  UploadMode,
} from "@/shared/types/chat";

interface MessageListProps {
  currentUserId: number;
  dialog: AppDialog;
  messages: AppMessage[];
  allMessages: AppMessage[];
  users: AppUser[];
  attachments: Attachment[];
  typing: boolean;
  getUserDisplayName: (userId: number) => string;
  isCompactLayout: boolean;
  isDragOverlayVisible: boolean;
  onBack: () => void;
  onDropFiles: (files: File[], mode: UploadMode) => void | Promise<void>;
  onDeleteMessage: (messageId: number) => void;
  onEditMessage: (messageId: number) => void;
  onTogglePinMessage: (messageId: number) => void;
  onReplyToMessage: (messageId: number) => void;
  onForwardMessage: (messageId: number) => void;
  onOpenProfile: (userId: number, dialogId?: number | null) => void;
  onOpenDialogEditor: (dialogId: number) => void;
}

interface MessageWithDate extends AppMessage {
  showDate?: boolean;
}

type MessageContextMenuState = {
  messageId: number;
  x: number;
  y: number;
} | null;

type MessageAttachmentItem = NonNullable<AppMessage["attachments"]>[number];

type ViewerState =
  | {
      attachment: MessageAttachmentItem;
      message: AppMessage;
    }
  | null;

const T = {
  today: "Сегодня",
  yesterday: "Вчера",
  lastSeen: "был(а) в сети",
  longAgo: "давно не в сети",
  typing: "печатает...",
  online: "онлайн",
  members: "участников",
  search: "Поиск",
  searchPlaceholder: "Поиск сообщений",
  pinnedPrefix: "Закреп: ",
  replyTo: "Ответ на: ",
  forwarded: "Переслано: ",
  viewed: " • прочитано",
  delivered: " • доставлено",
  edited: " • изменено",
  searchEmpty: "Поиск ничего не нашёл",
  noMessages: "Сообщений пока нет",
  message: "Сообщение",
  reply: "Ответить",
  forward: "Переслать",
  unpin: "Открепить",
  pin: "Закрепить",
  edit: "Редактировать",
  remove: "Удалить",
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatTime = (date: string) => {
  const value = new Date(date);
  return `${value.getHours().toString().padStart(2, "0")}:${value
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
};

const formatDate = (date: string) => {
  const value = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (value.toDateString() === today.toDateString()) return T.today;
  if (value.toDateString() === yesterday.toDateString()) return T.yesterday;
  return `${value.getDate().toString().padStart(2, "0")}.${(value.getMonth() + 1)
    .toString()
    .padStart(2, "0")}.${value.getFullYear()}`;
};

const getAttachmentLabel = (attachment: MessageAttachmentItem) => {
  if (attachment.type.startsWith("video/")) return "Видео";
  if (attachment.type.startsWith("image/")) return attachment.sentAsFile ? "Файл" : "Фотография";
  return "Файл";
};

export const MessageList = ({
  currentUserId,
  dialog,
  messages,
  allMessages,
  users,
  attachments,
  typing,
  getUserDisplayName,
  isCompactLayout,
  isDragOverlayVisible,
  onBack,
  onDropFiles,
  onDeleteMessage,
  onEditMessage,
  onTogglePinMessage,
  onReplyToMessage,
  onForwardMessage,
  onOpenProfile,
  onOpenDialogEditor,
}: MessageListProps) => {
  const SCROLLBAR_INSET = 10;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<MessageContextMenuState>(null);
  const [selectedVideoQuality, setSelectedVideoQuality] = useState<Record<string, string>>({});
  const [customScrollbarVisible, setCustomScrollbarVisible] = useState(false);
  const [scrollThumbHeight, setScrollThumbHeight] = useState(0);
  const [scrollThumbOffset, setScrollThumbOffset] = useState(0);
  const [dropHoverMode, setDropHoverMode] = useState<UploadMode | null>(null);
  const [viewerState, setViewerState] = useState<ViewerState>(null);
  const [deletingMessageIds, setDeletingMessageIds] = useState<number[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const searchShellRef = useRef<HTMLDivElement>(null);
  const scrollHideTimeoutRef = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const isDraggingScrollbarRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);
  const openContextMenu = (event: React.MouseEvent<HTMLDivElement>, messageId: number) => {
    event.preventDefault();
    setContextMenu({
      messageId,
      x: clamp(event.clientX, 12, window.innerWidth - 212),
      y: clamp(event.clientY, 12, window.innerHeight - 232),
    });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", esc);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const menuRect = contextMenuRef.current.getBoundingClientRect();
    const nextX = clamp(contextMenu.x, 12, window.innerWidth - menuRect.width - 12);
    const nextY = clamp(contextMenu.y, 12, window.innerHeight - menuRect.height - 12);
    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu((currentMenu) =>
        currentMenu ? { ...currentMenu, x: nextX, y: nextY } : currentMenu
      );
    }
  }, [contextMenu]);

  useEffect(() => {
    if (!searchOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (searchQuery.trim()) return;
      if (searchShellRef.current?.contains(event.target as Node)) return;
      setSearchOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [searchOpen, searchQuery]);

  const otherUser = useMemo(() => {
    if (dialog.kind === "group" || dialog.kind === "favorites") return null;
    return (
      users.find(
        (user) => user.user_id !== currentUserId && dialog.user_ids.includes(user.user_id)
      ) ?? null
    );
  }, [currentUserId, dialog.kind, dialog.user_ids, users]);

  const headerTitle =
    dialog.kind === "direct" && otherUser
      ? getUserDisplayName(otherUser.user_id)
      : dialog.customName ?? dialog.dialog_name;
  const headerAvatar = dialog.customPhoto
    ? dialog.customPhoto
    : dialog.attachment_id
      ? attachments.find((attachment) => attachment.attachment_id === dialog.attachment_id)
          ?.attachment_path ?? "/images/avatar.png"
      : otherUser?.avatar
        ? otherUser.avatar
        : otherUser?.attachment_id
          ? attachments.find((attachment) => attachment.attachment_id === otherUser.attachment_id)
              ?.attachment_path ?? "/images/avatar.png"
          : "/images/avatar.png";

  const filteredMessages = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return messages;
    return messages.filter((message) => {
      const ownText = message.message_text.toLowerCase();
      const replyText =
        allMessages.find((item) => item.message_id === message.replyToId)?.message_text.toLowerCase() ??
        "";
      return ownText.includes(normalizedQuery) || replyText.includes(normalizedQuery);
    });
  }, [allMessages, messages, searchQuery]);

  const messagesWithDate: MessageWithDate[] = useMemo(
    () =>
      filteredMessages.map((message, index) => {
        const currentDate = formatDate(message.created_at);
        const previousDate = index > 0 ? formatDate(filteredMessages[index - 1].created_at) : "";
        return { ...message, showDate: currentDate !== previousDate };
      }),
    [filteredMessages]
  );

  const pinnedMessages = useMemo(() => messages.filter((message) => message.pinned), [messages]);

  const getReplyMessage = (messageId?: number | null) =>
    messageId ? allMessages.find((message) => message.message_id === messageId) ?? null : null;

  useEffect(() => {
    shouldStickToBottomRef.current = true;
  }, [dialog.dialog_id]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    if (!shouldStickToBottomRef.current) return;

    const scrollToBottom = () => {
      element.scrollTop = element.scrollHeight;
    };

    scrollToBottom();
    const frameId = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frameId);
  }, [dialog.dialog_id, messagesWithDate.length]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const syncThumb = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const ratio = clientHeight / Math.max(scrollHeight, 1);
      const nextHeight = Math.max(52, clientHeight * ratio);
      const trackHeight = Math.max(clientHeight - nextHeight - SCROLLBAR_INSET * 2, 0);
      const nextOffset =
        scrollHeight <= clientHeight
          ? SCROLLBAR_INSET
          : SCROLLBAR_INSET + (scrollTop / (scrollHeight - clientHeight)) * trackHeight;

      shouldStickToBottomRef.current = scrollTop + clientHeight >= scrollHeight - 24;
      setScrollThumbHeight(nextHeight);
      setScrollThumbOffset(nextOffset);
      setCustomScrollbarVisible(scrollHeight > clientHeight);

      if (scrollHideTimeoutRef.current) {
        window.clearTimeout(scrollHideTimeoutRef.current);
      }

      if (scrollHeight > clientHeight) {
        scrollHideTimeoutRef.current = window.setTimeout(() => {
          if (!isDraggingScrollbarRef.current) {
            setCustomScrollbarVisible(false);
          }
        }, 900);
      }
    };

    const handleWheel = () => syncThumb();

    syncThumb();
    element.addEventListener("scroll", syncThumb, { passive: true });
    element.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("resize", syncThumb);

    return () => {
      element.removeEventListener("scroll", syncThumb);
      element.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", syncThumb);
      if (scrollHideTimeoutRef.current) {
        window.clearTimeout(scrollHideTimeoutRef.current);
      }
    };
  }, [messagesWithDate.length]);

  const scrollToBottomIfNeeded = () => {
    const element = scrollRef.current;
    if (!element || !shouldStickToBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
  };

  const handleDeleteWithAnimation = (messageId: number) => {
    setDeletingMessageIds((currentIds) => (currentIds.includes(messageId) ? currentIds : [...currentIds, messageId]));
    window.setTimeout(() => {
      onDeleteMessage(messageId);
      setDeletingMessageIds((currentIds) => currentIds.filter((id) => id !== messageId));
    }, 220);
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingScrollbarRef.current || !scrollRef.current) return;

      const element = scrollRef.current;
      const trackHeight = Math.max(element.clientHeight - scrollThumbHeight - SCROLLBAR_INSET * 2, 1);
      const scrollableHeight = Math.max(element.scrollHeight - element.clientHeight, 0);
      const delta = event.clientY - dragStartYRef.current;
      const scrollDelta = (delta / trackHeight) * scrollableHeight;
      element.scrollTop = dragStartScrollTopRef.current + scrollDelta;
      setCustomScrollbarVisible(true);
    };

    const handlePointerUp = () => {
      if (!isDraggingScrollbarRef.current) return;
      isDraggingScrollbarRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [scrollThumbHeight]);

  const selectedMessage = contextMenu
    ? messages.find((message) => message.message_id === contextMenu.messageId) ?? null
    : null;

  const lastOtherActivity = useMemo(() => {
    if (!otherUser) return "";
    const lastMessage = [...messages].reverse().find((message) => message.user_id === otherUser.user_id);
    return lastMessage
      ? `${T.lastSeen} ${formatDate(lastMessage.created_at)} ${formatTime(lastMessage.created_at)}`
      : T.longAgo;
  }, [messages, otherUser]);

  const statusLine = typing
    ? T.typing
    : otherUser?.user_status === "online"
      ? T.online
      : dialog.kind === "group"
        ? `${dialog.user_ids.length} ${T.members}`
        : lastOtherActivity;

  return (
    <div className="message-list">
      <div className="message-header">
        {isCompactLayout && (
          <button type="button" className="message-back-button" onClick={onBack} aria-label="Назад">
            ←
          </button>
        )}

        <button
          type="button"
          className="message-header-profile"
          onClick={() => {
            if (dialog.kind === "group") {
              onOpenDialogEditor(dialog.dialog_id);
              return;
            }
            if (otherUser) onOpenProfile(otherUser.user_id, dialog.dialog_id);
          }}
        >
          <div className="chat-avatar-wrap">
            <img src={headerAvatar} alt={headerTitle} />
            {otherUser?.user_status === "online" && <span className="chat-avatar-online" />}
          </div>
          <span className="message-header-info">
            <span className="dialog-name">{headerTitle}</span>
            <span className="message-header-status">{statusLine}</span>
          </span>
        </button>

        <div ref={searchShellRef} className={`message-search-shell ${searchOpen ? "open" : ""}`}>
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={T.searchPlaceholder}
          />
          <button
            type="button"
            onClick={() => {
              if (searchOpen && !searchQuery.trim()) {
                setSearchOpen(false);
                return;
              }
              setSearchOpen(true);
            }}
          >
            {T.search}
          </button>
        </div>
      </div>

      {pinnedMessages.length > 0 && (
        <div className="pinned-messages-bar">
          {pinnedMessages.slice(0, 2).map((message) => (
            <button
              key={message.message_id}
              type="button"
              className="pinned-message-chip"
              onClick={() => {
                const element = document.getElementById(`msg-${message.message_id}`);
                element?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              {T.pinnedPrefix}
              {message.message_text || (message.attachments?.[0] ? getAttachmentLabel(message.attachments[0]) : T.message)}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className="messages-container"
        onDragOver={(event) => event.preventDefault()}
        onDrop={async (event) => {
          event.preventDefault();
          if (isDragOverlayVisible) return;
          const files = Array.from(event.dataTransfer.files);
          if (files.length) {
            await onDropFiles([files[0]], "compressed");
          }
        }}
      >
        <div
          className={`custom-scrollbar-thumb ${customScrollbarVisible ? "visible" : ""}`}
          style={{
            height: `${scrollThumbHeight}px`,
            transform: `translateY(${scrollThumbOffset}px)`,
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            isDraggingScrollbarRef.current = true;
            dragStartYRef.current = event.clientY;
            dragStartScrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "ns-resize";
            setCustomScrollbarVisible(true);
          }}
        />

        {messagesWithDate.map((message) => {
          const isMe = message.user_id === currentUserId;
          const replyMessage = getReplyMessage(message.replyToId);
          const forwardedMessage = getReplyMessage(message.forwardedFromId);

          return (
            <div
              key={message.message_id}
              id={`msg-${message.message_id}`}
              className={`message ${deletingMessageIds.includes(message.message_id) ? "is-removing" : ""}`}
              onContextMenu={(event) => openContextMenu(event, message.message_id)}
            >
              {message.showDate && <div className="message-date">{formatDate(message.created_at)}</div>}
              <div className={`message-row ${isMe ? "mine" : "theirs"}`}>
                <div className={`message-bubble ${isMe ? "message-me" : "message-other"} ${message.attachments?.length ? "has-media" : ""}`}>
                  {dialog.kind === "group" && !isMe && (
                    <span className="message-author">{getUserDisplayName(message.user_id)}</span>
                  )}
                  {replyMessage && (
                    <div className="message-reference">
                      <span>
                        {T.replyTo}
                        {replyMessage.message_text}
                      </span>
                    </div>
                  )}
                  {forwardedMessage && (
                    <div className="message-reference forwarded">
                      <span>
                        {T.forwarded}
                        {forwardedMessage.message_text}
                      </span>
                    </div>
                  )}
                  {message.message_text && <span className="message-text">{message.message_text}</span>}

                  {message.attachments?.length ? (
                    <div className="message-attachments">
                      {message.attachments.map((attachment) => {
                        const videoSource =
                          selectedVideoQuality[attachment.id] ??
                          attachment.qualities?.[0]?.url ??
                          attachment.preview ??
                          "";

                        const isInlineImage = attachment.type.startsWith("image/") && attachment.preview && !attachment.sentAsFile;
                        const isInlineVideo = attachment.type.startsWith("video/") && attachment.preview && !attachment.sentAsFile;

                        if (isInlineImage) {
                          return (
                            <button
                              key={attachment.id}
                              type="button"
                              className="message-media-button"
                              onClick={() => setViewerState({ attachment, message })}
                            >
                              <img
                                className="message-attachment-image"
                                src={attachment.preview}
                                alt={attachment.name}
                                onLoad={scrollToBottomIfNeeded}
                              />
                            </button>
                          );
                        }

                        if (isInlineVideo) {
                          return (
                            <button
                              key={attachment.id}
                              type="button"
                              className="message-media-button"
                              onClick={() => setViewerState({ attachment, message })}
                            >
                              <video
                                className="message-attachment-video"
                                src={videoSource}
                                muted
                                playsInline
                                preload="metadata"
                                onLoadedMetadata={scrollToBottomIfNeeded}
                              />
                            </button>
                          );
                        }

                        return (
                          <button
                            key={attachment.id}
                            type="button"
                            className="message-attachment-chip"
                            onClick={() => setViewerState({ attachment, message })}
                          >
                            {getAttachmentLabel(attachment)}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <span className={`message-time ${isMe ? "message-time-me" : "message-time-other"} ${message.attachments?.length ? "is-overlay" : ""}`}>
                    {formatTime(message.created_at)}
                    {isMe && (
                      <span className="message-delivery-state">
                        {message.message_status === "viewed" ? T.viewed : T.delivered}
                      </span>
                    )}
                    {message.edited && <span className="message-edited">{T.edited}</span>}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {!messagesWithDate.length && (
          <div className="chat-placeholder compact">{searchQuery ? T.searchEmpty : T.noMessages}</div>
        )}
      </div>

      {isDragOverlayVisible && (
        <div className="message-drop-overlay">
          <div className="message-drop-overlay-zones">
            <button
              type="button"
              className={`message-drop-zone ${dropHoverMode === "original" ? "active" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDropHoverMode("original");
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDropHoverMode("original");
              }}
              onDragLeave={() => setDropHoverMode((currentMode) => (currentMode === "original" ? null : currentMode))}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDropHoverMode(null);
                const files = Array.from(event.dataTransfer.files);
                if (files.length) {
                  void onDropFiles([files[0]], "original");
                }
              }}
            >
              <span className="message-drop-zone-label">Без сжатия</span>
              <strong>Отправить как файл</strong>
              <span>Фото и видео будут отправлены без сжатия</span>
            </button>
            <button
              type="button"
              className={`message-drop-zone ${dropHoverMode === "compressed" ? "active" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDropHoverMode("compressed");
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDropHoverMode("compressed");
              }}
              onDragLeave={() => setDropHoverMode((currentMode) => (currentMode === "compressed" ? null : currentMode))}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDropHoverMode(null);
                const files = Array.from(event.dataTransfer.files);
                if (files.length) {
                  void onDropFiles([files[0]], "compressed");
                }
              }}
            >
              <span className="message-drop-zone-label">С сжатием</span>
              <strong>Отправить как медиа</strong>
              <span>Фото и видео можно будет открыть прямо в чате</span>
            </button>
          </div>
        </div>
      )}
      {contextMenu && selectedMessage && (
        <div
          ref={contextMenuRef}
          className="chat-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="chat-context-menu-title">
            {selectedMessage.message_text.slice(0, 30) || T.message}
          </div>
          <button
            type="button"
            onClick={() => {
              onReplyToMessage(selectedMessage.message_id);
              setContextMenu(null);
            }}
          >
            {T.reply}
          </button>
          <button
            type="button"
            onClick={() => {
              onForwardMessage(selectedMessage.message_id);
              setContextMenu(null);
            }}
          >
            {T.forward}
          </button>
          <button
            type="button"
            onClick={() => {
              onTogglePinMessage(selectedMessage.message_id);
              setContextMenu(null);
            }}
          >
            {selectedMessage.pinned ? T.unpin : T.pin}
          </button>
          {selectedMessage.user_id === currentUserId && (
            <>
              <button
                type="button"
                onClick={() => {
                  onEditMessage(selectedMessage.message_id);
                  setContextMenu(null);
                }}
              >
                {T.edit}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  handleDeleteWithAnimation(selectedMessage.message_id);
                  setContextMenu(null);
                }}
              >
                {T.remove}
              </button>
            </>
          )}
        </div>
      )}

      {viewerState?.attachment.preview && (
        <div className="media-viewer-backdrop" onClick={() => setViewerState(null)}>
          <div className="media-viewer" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="media-viewer-close" onClick={() => setViewerState(null)}>
              Закрыть
            </button>
            <div className="media-viewer-body">
              {viewerState.attachment.type.startsWith("image/") ? (
                <img className="media-viewer-image" src={viewerState.attachment.preview} alt={viewerState.attachment.name} />
              ) : viewerState.attachment.type.startsWith("video/") ? (
                <video className="media-viewer-video" src={viewerState.attachment.preview} controls autoPlay />
              ) : null}
            </div>
            <div className="media-viewer-footer">
              <span>{viewerState.attachment.serverName ?? viewerState.attachment.name}</span>
              <a href={viewerState.attachment.preview} download={viewerState.attachment.serverName ?? viewerState.attachment.name}>
                Скачать
              </a>
              <span>{formatTime(viewerState.message.created_at)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
