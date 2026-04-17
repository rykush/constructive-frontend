import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
};
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const formatTime = (date) => {
    const value = new Date(date);
    return `${value.getHours().toString().padStart(2, "0")}:${value
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
};
const formatDate = (date) => {
    const value = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (value.toDateString() === today.toDateString())
        return T.today;
    if (value.toDateString() === yesterday.toDateString())
        return T.yesterday;
    return `${value.getDate().toString().padStart(2, "0")}.${(value.getMonth() + 1)
        .toString()
        .padStart(2, "0")}.${value.getFullYear()}`;
};
const getAttachmentLabel = (attachment) => {
    if (attachment.type.startsWith("video/"))
        return "Видео";
    if (attachment.type.startsWith("image/"))
        return attachment.sentAsFile ? "Файл" : "Фотография";
    return "Файл";
};
export const MessageList = ({ currentUserId, dialog, messages, allMessages, users, attachments, typing, getUserDisplayName, isCompactLayout, isDragOverlayVisible, onBack, onDropFiles, onDeleteMessage, onEditMessage, onTogglePinMessage, onReplyToMessage, onForwardMessage, onOpenProfile, onOpenDialogEditor, }) => {
    const SCROLLBAR_INSET = 10;
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [contextMenu, setContextMenu] = useState(null);
    const [selectedVideoQuality, setSelectedVideoQuality] = useState({});
    const [customScrollbarVisible, setCustomScrollbarVisible] = useState(false);
    const [scrollThumbHeight, setScrollThumbHeight] = useState(0);
    const [scrollThumbOffset, setScrollThumbOffset] = useState(0);
    const [dropHoverMode, setDropHoverMode] = useState(null);
    const [viewerState, setViewerState] = useState(null);
    const [deletingMessageIds, setDeletingMessageIds] = useState([]);
    const scrollRef = useRef(null);
    const contextMenuRef = useRef(null);
    const searchShellRef = useRef(null);
    const scrollHideTimeoutRef = useRef(null);
    const shouldStickToBottomRef = useRef(true);
    const isDraggingScrollbarRef = useRef(false);
    const dragStartYRef = useRef(0);
    const dragStartScrollTopRef = useRef(0);
    const openContextMenu = (event, messageId) => {
        event.preventDefault();
        setContextMenu({
            messageId,
            x: clamp(event.clientX, 12, window.innerWidth - 212),
            y: clamp(event.clientY, 12, window.innerHeight - 232),
        });
    };
    useEffect(() => {
        if (!contextMenu)
            return;
        const close = () => setContextMenu(null);
        const esc = (event) => {
            if (event.key === "Escape")
                setContextMenu(null);
        };
        window.addEventListener("click", close);
        window.addEventListener("keydown", esc);
        return () => {
            window.removeEventListener("click", close);
            window.removeEventListener("keydown", esc);
        };
    }, [contextMenu]);
    useEffect(() => {
        if (!contextMenu || !contextMenuRef.current)
            return;
        const menuRect = contextMenuRef.current.getBoundingClientRect();
        const nextX = clamp(contextMenu.x, 12, window.innerWidth - menuRect.width - 12);
        const nextY = clamp(contextMenu.y, 12, window.innerHeight - menuRect.height - 12);
        if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
            setContextMenu((currentMenu) => currentMenu ? { ...currentMenu, x: nextX, y: nextY } : currentMenu);
        }
    }, [contextMenu]);
    useEffect(() => {
        if (!searchOpen)
            return;
        const handlePointerDown = (event) => {
            if (searchQuery.trim())
                return;
            if (searchShellRef.current?.contains(event.target))
                return;
            setSearchOpen(false);
        };
        window.addEventListener("mousedown", handlePointerDown);
        return () => window.removeEventListener("mousedown", handlePointerDown);
    }, [searchOpen, searchQuery]);
    const otherUser = useMemo(() => {
        if (dialog.kind === "group" || dialog.kind === "favorites")
            return null;
        return (users.find((user) => user.user_id !== currentUserId && dialog.user_ids.includes(user.user_id)) ?? null);
    }, [currentUserId, dialog.kind, dialog.user_ids, users]);
    const headerTitle = dialog.kind === "direct" && otherUser
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
        if (!normalizedQuery)
            return messages;
        return messages.filter((message) => {
            const ownText = message.message_text.toLowerCase();
            const replyText = allMessages.find((item) => item.message_id === message.replyToId)?.message_text.toLowerCase() ??
                "";
            return ownText.includes(normalizedQuery) || replyText.includes(normalizedQuery);
        });
    }, [allMessages, messages, searchQuery]);
    const messagesWithDate = useMemo(() => filteredMessages.map((message, index) => {
        const currentDate = formatDate(message.created_at);
        const previousDate = index > 0 ? formatDate(filteredMessages[index - 1].created_at) : "";
        return { ...message, showDate: currentDate !== previousDate };
    }), [filteredMessages]);
    const pinnedMessages = useMemo(() => messages.filter((message) => message.pinned), [messages]);
    const getReplyMessage = (messageId) => messageId ? allMessages.find((message) => message.message_id === messageId) ?? null : null;
    useEffect(() => {
        shouldStickToBottomRef.current = true;
    }, [dialog.dialog_id]);
    useLayoutEffect(() => {
        const element = scrollRef.current;
        if (!element)
            return;
        if (!shouldStickToBottomRef.current)
            return;
        const scrollToBottom = () => {
            element.scrollTop = element.scrollHeight;
        };
        scrollToBottom();
        const frameId = window.requestAnimationFrame(scrollToBottom);
        return () => window.cancelAnimationFrame(frameId);
    }, [dialog.dialog_id, messagesWithDate.length]);
    useEffect(() => {
        const element = scrollRef.current;
        if (!element)
            return;
        const syncThumb = () => {
            const { scrollTop, scrollHeight, clientHeight } = element;
            const ratio = clientHeight / Math.max(scrollHeight, 1);
            const nextHeight = Math.max(52, clientHeight * ratio);
            const trackHeight = Math.max(clientHeight - nextHeight - SCROLLBAR_INSET * 2, 0);
            const nextOffset = scrollHeight <= clientHeight
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
        if (!element || !shouldStickToBottomRef.current)
            return;
        element.scrollTop = element.scrollHeight;
    };
    const handleDeleteWithAnimation = (messageId) => {
        setDeletingMessageIds((currentIds) => (currentIds.includes(messageId) ? currentIds : [...currentIds, messageId]));
        window.setTimeout(() => {
            onDeleteMessage(messageId);
            setDeletingMessageIds((currentIds) => currentIds.filter((id) => id !== messageId));
        }, 220);
    };
    useEffect(() => {
        const handlePointerMove = (event) => {
            if (!isDraggingScrollbarRef.current || !scrollRef.current)
                return;
            const element = scrollRef.current;
            const trackHeight = Math.max(element.clientHeight - scrollThumbHeight - SCROLLBAR_INSET * 2, 1);
            const scrollableHeight = Math.max(element.scrollHeight - element.clientHeight, 0);
            const delta = event.clientY - dragStartYRef.current;
            const scrollDelta = (delta / trackHeight) * scrollableHeight;
            element.scrollTop = dragStartScrollTopRef.current + scrollDelta;
            setCustomScrollbarVisible(true);
        };
        const handlePointerUp = () => {
            if (!isDraggingScrollbarRef.current)
                return;
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
        if (!otherUser)
            return "";
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
    return (_jsxs("div", { className: "message-list", children: [_jsxs("div", { className: "message-header", children: [isCompactLayout && (_jsx("button", { type: "button", className: "message-back-button", onClick: onBack, "aria-label": "\u041D\u0430\u0437\u0430\u0434", children: "\u2190" })), _jsxs("button", { type: "button", className: "message-header-profile", onClick: () => {
                            if (dialog.kind === "group") {
                                onOpenDialogEditor(dialog.dialog_id);
                                return;
                            }
                            if (otherUser)
                                onOpenProfile(otherUser.user_id, dialog.dialog_id);
                        }, children: [_jsxs("div", { className: "chat-avatar-wrap", children: [_jsx("img", { src: headerAvatar, alt: headerTitle }), otherUser?.user_status === "online" && _jsx("span", { className: "chat-avatar-online" })] }), _jsxs("span", { className: "message-header-info", children: [_jsx("span", { className: "dialog-name", children: headerTitle }), _jsx("span", { className: "message-header-status", children: statusLine })] })] }), _jsxs("div", { ref: searchShellRef, className: `message-search-shell ${searchOpen ? "open" : ""}`, children: [_jsx("input", { type: "text", value: searchQuery, onChange: (event) => setSearchQuery(event.target.value), placeholder: T.searchPlaceholder }), _jsx("button", { type: "button", onClick: () => {
                                    if (searchOpen && !searchQuery.trim()) {
                                        setSearchOpen(false);
                                        return;
                                    }
                                    setSearchOpen(true);
                                }, children: T.search })] })] }), pinnedMessages.length > 0 && (_jsx("div", { className: "pinned-messages-bar", children: pinnedMessages.slice(0, 2).map((message) => (_jsxs("button", { type: "button", className: "pinned-message-chip", onClick: () => {
                        const element = document.getElementById(`msg-${message.message_id}`);
                        element?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, children: [T.pinnedPrefix, message.message_text || (message.attachments?.[0] ? getAttachmentLabel(message.attachments[0]) : T.message)] }, message.message_id))) })), _jsxs("div", { ref: scrollRef, className: "messages-container", onDragOver: (event) => event.preventDefault(), onDrop: async (event) => {
                    event.preventDefault();
                    if (isDragOverlayVisible)
                        return;
                    const files = Array.from(event.dataTransfer.files);
                    if (files.length) {
                        await onDropFiles([files[0]], "compressed");
                    }
                }, children: [_jsx("div", { className: `custom-scrollbar-thumb ${customScrollbarVisible ? "visible" : ""}`, style: {
                            height: `${scrollThumbHeight}px`,
                            transform: `translateY(${scrollThumbOffset}px)`,
                        }, onPointerDown: (event) => {
                            event.preventDefault();
                            isDraggingScrollbarRef.current = true;
                            dragStartYRef.current = event.clientY;
                            dragStartScrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
                            document.body.style.userSelect = "none";
                            document.body.style.cursor = "ns-resize";
                            setCustomScrollbarVisible(true);
                        } }), messagesWithDate.map((message) => {
                        const isMe = message.user_id === currentUserId;
                        const replyMessage = getReplyMessage(message.replyToId);
                        const forwardedMessage = getReplyMessage(message.forwardedFromId);
                        return (_jsxs("div", { id: `msg-${message.message_id}`, className: `message ${deletingMessageIds.includes(message.message_id) ? "is-removing" : ""}`, onContextMenu: (event) => openContextMenu(event, message.message_id), children: [message.showDate && _jsx("div", { className: "message-date", children: formatDate(message.created_at) }), _jsx("div", { className: `message-row ${isMe ? "mine" : "theirs"}`, children: _jsxs("div", { className: `message-bubble ${isMe ? "message-me" : "message-other"} ${message.attachments?.length ? "has-media" : ""}`, children: [dialog.kind === "group" && !isMe && (_jsx("span", { className: "message-author", children: getUserDisplayName(message.user_id) })), replyMessage && (_jsx("div", { className: "message-reference", children: _jsxs("span", { children: [T.replyTo, replyMessage.message_text] }) })), forwardedMessage && (_jsx("div", { className: "message-reference forwarded", children: _jsxs("span", { children: [T.forwarded, forwardedMessage.message_text] }) })), message.message_text && _jsx("span", { className: "message-text", children: message.message_text }), message.attachments?.length ? (_jsx("div", { className: "message-attachments", children: message.attachments.map((attachment) => {
                                                    const videoSource = selectedVideoQuality[attachment.id] ??
                                                        attachment.qualities?.[0]?.url ??
                                                        attachment.preview ??
                                                        "";
                                                    const isInlineImage = attachment.type.startsWith("image/") && attachment.preview && !attachment.sentAsFile;
                                                    const isInlineVideo = attachment.type.startsWith("video/") && attachment.preview && !attachment.sentAsFile;
                                                    if (isInlineImage) {
                                                        return (_jsx("button", { type: "button", className: "message-media-button", onClick: () => setViewerState({ attachment, message }), children: _jsx("img", { className: "message-attachment-image", src: attachment.preview, alt: attachment.name, onLoad: scrollToBottomIfNeeded }) }, attachment.id));
                                                    }
                                                    if (isInlineVideo) {
                                                        return (_jsx("button", { type: "button", className: "message-media-button", onClick: () => setViewerState({ attachment, message }), children: _jsx("video", { className: "message-attachment-video", src: videoSource, muted: true, playsInline: true, preload: "metadata", onLoadedMetadata: scrollToBottomIfNeeded }) }, attachment.id));
                                                    }
                                                    return (_jsx("button", { type: "button", className: "message-attachment-chip", onClick: () => setViewerState({ attachment, message }), children: getAttachmentLabel(attachment) }, attachment.id));
                                                }) })) : null, _jsxs("span", { className: `message-time ${isMe ? "message-time-me" : "message-time-other"} ${message.attachments?.length ? "is-overlay" : ""}`, children: [formatTime(message.created_at), isMe && (_jsx("span", { className: "message-delivery-state", children: message.message_status === "viewed" ? T.viewed : T.delivered })), message.edited && _jsx("span", { className: "message-edited", children: T.edited })] })] }) })] }, message.message_id));
                    }), !messagesWithDate.length && (_jsx("div", { className: "chat-placeholder compact", children: searchQuery ? T.searchEmpty : T.noMessages }))] }), isDragOverlayVisible && (_jsx("div", { className: "message-drop-overlay", children: _jsxs("div", { className: "message-drop-overlay-zones", children: [_jsxs("button", { type: "button", className: `message-drop-zone ${dropHoverMode === "original" ? "active" : ""}`, onDragEnter: (event) => {
                                event.preventDefault();
                                setDropHoverMode("original");
                            }, onDragOver: (event) => {
                                event.preventDefault();
                                setDropHoverMode("original");
                            }, onDragLeave: () => setDropHoverMode((currentMode) => (currentMode === "original" ? null : currentMode)), onDrop: (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setDropHoverMode(null);
                                const files = Array.from(event.dataTransfer.files);
                                if (files.length) {
                                    void onDropFiles([files[0]], "original");
                                }
                            }, children: [_jsx("span", { className: "message-drop-zone-label", children: "\u0411\u0435\u0437 \u0441\u0436\u0430\u0442\u0438\u044F" }), _jsx("strong", { children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043A\u0430\u043A \u0444\u0430\u0439\u043B" }), _jsx("span", { children: "\u0424\u043E\u0442\u043E \u0438 \u0432\u0438\u0434\u0435\u043E \u0431\u0443\u0434\u0443\u0442 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u044B \u0431\u0435\u0437 \u0441\u0436\u0430\u0442\u0438\u044F" })] }), _jsxs("button", { type: "button", className: `message-drop-zone ${dropHoverMode === "compressed" ? "active" : ""}`, onDragEnter: (event) => {
                                event.preventDefault();
                                setDropHoverMode("compressed");
                            }, onDragOver: (event) => {
                                event.preventDefault();
                                setDropHoverMode("compressed");
                            }, onDragLeave: () => setDropHoverMode((currentMode) => (currentMode === "compressed" ? null : currentMode)), onDrop: (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setDropHoverMode(null);
                                const files = Array.from(event.dataTransfer.files);
                                if (files.length) {
                                    void onDropFiles([files[0]], "compressed");
                                }
                            }, children: [_jsx("span", { className: "message-drop-zone-label", children: "\u0421 \u0441\u0436\u0430\u0442\u0438\u0435\u043C" }), _jsx("strong", { children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043A\u0430\u043A \u043C\u0435\u0434\u0438\u0430" }), _jsx("span", { children: "\u0424\u043E\u0442\u043E \u0438 \u0432\u0438\u0434\u0435\u043E \u043C\u043E\u0436\u043D\u043E \u0431\u0443\u0434\u0435\u0442 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u044F\u043C\u043E \u0432 \u0447\u0430\u0442\u0435" })] })] }) })), contextMenu && selectedMessage && (_jsxs("div", { ref: contextMenuRef, className: "chat-context-menu", style: { left: contextMenu.x, top: contextMenu.y }, onClick: (event) => event.stopPropagation(), children: [_jsx("div", { className: "chat-context-menu-title", children: selectedMessage.message_text.slice(0, 30) || T.message }), _jsx("button", { type: "button", onClick: () => {
                            onReplyToMessage(selectedMessage.message_id);
                            setContextMenu(null);
                        }, children: T.reply }), _jsx("button", { type: "button", onClick: () => {
                            onForwardMessage(selectedMessage.message_id);
                            setContextMenu(null);
                        }, children: T.forward }), _jsx("button", { type: "button", onClick: () => {
                            onTogglePinMessage(selectedMessage.message_id);
                            setContextMenu(null);
                        }, children: selectedMessage.pinned ? T.unpin : T.pin }), selectedMessage.user_id === currentUserId && (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", onClick: () => {
                                    onEditMessage(selectedMessage.message_id);
                                    setContextMenu(null);
                                }, children: T.edit }), _jsx("button", { type: "button", className: "danger", onClick: () => {
                                    handleDeleteWithAnimation(selectedMessage.message_id);
                                    setContextMenu(null);
                                }, children: T.remove })] }))] })), viewerState?.attachment.preview && (_jsx("div", { className: "media-viewer-backdrop", onClick: () => setViewerState(null), children: _jsxs("div", { className: "media-viewer", onClick: (event) => event.stopPropagation(), children: [_jsx("button", { type: "button", className: "media-viewer-close", onClick: () => setViewerState(null), children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" }), _jsx("div", { className: "media-viewer-body", children: viewerState.attachment.type.startsWith("image/") ? (_jsx("img", { className: "media-viewer-image", src: viewerState.attachment.preview, alt: viewerState.attachment.name })) : viewerState.attachment.type.startsWith("video/") ? (_jsx("video", { className: "media-viewer-video", src: viewerState.attachment.preview, controls: true, autoPlay: true })) : null }), _jsxs("div", { className: "media-viewer-footer", children: [_jsx("span", { children: viewerState.attachment.serverName ?? viewerState.attachment.name }), _jsx("a", { href: viewerState.attachment.preview, download: viewerState.attachment.serverName ?? viewerState.attachment.name, children: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C" }), _jsx("span", { children: formatTime(viewerState.message.created_at) })] })] }) }))] }));
};
