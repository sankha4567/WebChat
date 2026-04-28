"use client";

import { FileIcon, Image as ImageIcon, Mic } from "lucide-react";

// Minimal shape consumed by both compose-area and inline reply previews.
// Loose typing so it works with both `Message` from getMessages and the
// inner `replyTo` shape on a message bubble.
export interface ReplyPreviewMessage {
  type: "text" | "image" | "file" | "voice" | "system" | "reaction";
  content?: string;
  fileUrl?: string;
  fileName?: string;
}

interface ReplyPreviewBodyProps {
  message: ReplyPreviewMessage;
  senderLabel: string;
  size?: "sm" | "md";
}

export function ReplyPreviewBody({
  message,
  senderLabel,
  size = "md",
}: ReplyPreviewBodyProps) {
  const headingClass = size === "sm" ? "text-xs" : "text-sm";
  const subtitleClass = size === "sm" ? "text-xs" : "text-sm";
  const iconClass = "w-3 h-3 flex-shrink-0";

  const isImage = message.type === "image" && !!message.fileUrl;

  let icon = null;
  let subtitle: string;

  switch (message.type) {
    case "image":
      icon = <ImageIcon className={iconClass} />;
      subtitle = "Photo";
      break;
    case "file":
      icon = <FileIcon className={iconClass} />;
      subtitle = message.fileName || "File";
      break;
    case "voice":
      icon = <Mic className={iconClass} />;
      subtitle = "Voice message";
      break;
    case "text":
    default:
      subtitle = message.content || "";
      break;
  }

  const thumbSize = size === "sm" ? "w-8 h-8" : "w-10 h-10";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 min-w-0">
        <p className={`${headingClass} font-medium text-primary-400 truncate`}>
          {senderLabel}
        </p>
        <p
          className={`${subtitleClass} text-chat-text-muted truncate flex items-center gap-1`}
        >
          {icon}
          <span className="truncate">{subtitle}</span>
        </p>
      </div>
      {isImage && (
        <img
          src={message.fileUrl}
          alt=""
          className={`${thumbSize} rounded object-cover flex-shrink-0`}
        />
      )}
    </div>
  );
}
