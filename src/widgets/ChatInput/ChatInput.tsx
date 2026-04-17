import { useRef, useState, type KeyboardEvent } from "react";
import type { AppMessage, MessageAttachmentDraft, UploadMode } from "@/shared/types/chat";

interface ChatInputProps {
  value: string;
  error?: string;
  isCompactLayout?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onAddFiles: (files: File[], uploadMode: UploadMode) => void | Promise<void>;
  attachedFiles: MessageAttachmentDraft[];
  onRemoveFile: (attachmentId: string) => void;
  replyMessage: AppMessage | null;
  forwardedMessage: AppMessage | null;
  editingMessage: AppMessage | null;
  onCancelReply: () => void;
  onCancelForward: () => void;
  onCancelEdit: () => void;
}

export const ChatInput = ({
  value,
  error,
  isCompactLayout,
  onChange,
  onSend,
  onAddFiles,
  attachedFiles,
  onRemoveFile,
  replyMessage,
  forwardedMessage,
  editingMessage,
  onCancelReply,
  onCancelForward,
  onCancelEdit,
}: ChatInputProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewerAttachment, setViewerAttachment] = useState<MessageAttachmentDraft | null>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const handleSelectFiles = async (files: FileList | null, mode: UploadMode) => {
    const nextFiles = Array.from(files ?? []);
    if (nextFiles.length) {
      await onAddFiles(nextFiles, mode);
    }
  };

  return (
    <div className="chat-input-shell">
      {(replyMessage || forwardedMessage || editingMessage) && (
        <div className="chat-input-meta">
          {replyMessage && (
            <div className="chat-input-meta-card">
              <span>Ответ: {replyMessage.message_text}</span>
              <button type="button" onClick={onCancelReply}>
                ×
              </button>
            </div>
          )}
          {forwardedMessage && (
            <div className="chat-input-meta-card">
              <span>Пересылка: {forwardedMessage.message_text}</span>
              <button type="button" onClick={onCancelForward}>
                ×
              </button>
            </div>
          )}
          {editingMessage && (
            <div className="chat-input-meta-card">
              <span>Редактирование сообщения</span>
              <button type="button" onClick={onCancelEdit}>
                ×
              </button>
            </div>
          )}
        </div>
      )}
      {attachedFiles.length > 0 && (
        <div className="chat-input-files">
          {attachedFiles.map((file) => (
            <div
              key={file.id}
              className={`chat-input-file-chip ${file.type.startsWith("image/") || file.type.startsWith("video/") ? "is-media" : ""}`}
            >
              {(file.type.startsWith("image/") || file.type.startsWith("video/")) && file.preview ? (
                <button type="button" className="chat-input-media-preview" onClick={() => setViewerAttachment(file)}>
                  {file.type.startsWith("image/") ? (
                    <img src={file.preview} alt="" />
                  ) : (
                    <video src={file.preview} muted playsInline preload="metadata" />
                  )}
                </button>
              ) : (
                <span>{file.name}</span>
              )}
              <button type="button" onClick={() => onRemoveFile(file.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="auth-error">{error}</div>}

      <div className="chat-input chat-input-modern">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="chat-input-file-hidden"
          onChange={(event) => {
            void handleSelectFiles(event.target.files, "compressed");
            event.target.value = "";
          }}
        />

        <div className="chat-input-attach-shell">
          <button
            type="button"
            className="chat-input-attach"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Прикрепить файлы"
          >
            +
          </button>
        </div>

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Сообщение..."
        />

        <button type="button" className="chat-input-send" onClick={onSend}>
          ➜
        </button>
      </div>

      {viewerAttachment && viewerAttachment.preview && (
        <div className="media-viewer-backdrop" onClick={() => setViewerAttachment(null)}>
          <div className="media-viewer" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="media-viewer-close" onClick={() => setViewerAttachment(null)}>
              Закрыть
            </button>
            <div className="media-viewer-body">
              {viewerAttachment.type.startsWith("image/") ? (
                <img className="media-viewer-image" src={viewerAttachment.preview} alt={viewerAttachment.name} />
              ) : (
                <video className="media-viewer-video" src={viewerAttachment.preview} controls autoPlay />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
