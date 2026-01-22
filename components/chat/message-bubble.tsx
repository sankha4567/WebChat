"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { format } from "date-fns";
import {
  Reply,
  Pencil,
  Trash2,
  Check,
  CheckCheck,
  X,
  Smile,
  Play,
  Pause,
  Download,
  FileIcon,
} from "lucide-react";
import { cn, formatFileSize, formatDuration } from "@/lib/utils";
import { EmojiPicker } from "./emoji-picker";

interface MessageBubbleProps {
  message: any;
  conversationId: Id<"conversations">;
  onReply: () => void;
}

export function MessageBubble({
  message,
  conversationId,
  onReply,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || "");
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);

  const editMessage = useMutation(api.messages.editMessage);
  const deleteForMe = useMutation(api.messages.deleteMessageForMe);
  const deleteForEveryone = useMutation(api.messages.deleteMessageForEveryone);
  const addReaction = useMutation(api.messages.addReaction);

  const handleEdit = async () => {
    if (!editContent.trim() || editContent === message.content) {
      setIsEditing(false);
      return;
    }

    try {
      await editMessage({ messageId: message._id, content: editContent.trim() });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to edit message:", error);
    }
  };

  const handleDeleteForMe = async () => {
    try {
      await deleteForMe({ messageId: message._id });
      setShowDeleteMenu(false);
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

  const handleDeleteForEveryone = async () => {
    try {
      await deleteForEveryone({ messageId: message._id });
      setShowDeleteMenu(false);
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

  const handleReaction = async (emoji: string) => {
    try {
      await addReaction({ messageId: message._id, emoji });
      setShowEmojiPicker(false);
    } catch (error) {
      console.error("Failed to add reaction:", error);
    }
  };

  if (message.deletedForEveryone) {
    return (
      <div
        className={cn(
          "flex mb-1",
          message.isOwn ? "justify-end" : "justify-start"
        )}
      >
        <div
          className={cn(
            "px-3 py-2 rounded-lg max-w-[65%] italic text-chat-text-muted text-sm",
            message.isOwn ? "bg-chat-bubble-outgoing/50" : "bg-chat-bubble-incoming/50"
          )}
        >
          This message was deleted
        </div>
      </div>
    );
  }

  if (message.type === "system") {
    return (
      <div className="flex justify-center my-2">
        <span className="px-3 py-1 bg-chat-header/80 rounded-lg text-xs text-chat-text-muted">
          {message.content}
        </span>
      </div>
    );
  }

  const time = format(new Date(message.createdAt), "HH:mm");

  return (
    <div
      className={cn("flex mb-1 group", message.isOwn ? "justify-end" : "justify-start")}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        if (!isEditing) setShowDeleteMenu(false);
      }}
    >
      {/* Actions Menu (left side for own messages) */}
      {message.isOwn && showActions && !isEditing && (
        <div className="flex items-center gap-1 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setShowEmojiPicker(true)}
            className="p-1.5 hover:bg-chat-hover rounded-full"
          >
            <Smile className="w-4 h-4 text-chat-text-muted" />
          </button>
          <button
            onClick={onReply}
            className="p-1.5 hover:bg-chat-hover rounded-full"
          >
            <Reply className="w-4 h-4 text-chat-text-muted" />
          </button>
          {message.type === "text" && (
            <button
              onClick={() => {
                setIsEditing(true);
                setEditContent(message.content);
              }}
              className="p-1.5 hover:bg-chat-hover rounded-full"
            >
              <Pencil className="w-4 h-4 text-chat-text-muted" />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowDeleteMenu(!showDeleteMenu)}
              className="p-1.5 hover:bg-chat-hover rounded-full"
            >
              <Trash2 className="w-4 h-4 text-chat-text-muted" />
            </button>
            {showDeleteMenu && (
              <div className="absolute right-0 top-full mt-1 py-1 bg-chat-header rounded-lg shadow-xl border border-chat-border z-10 min-w-[160px]">
                <button
                  onClick={handleDeleteForMe}
                  className="w-full px-4 py-2 text-left text-sm text-chat-text-primary hover:bg-chat-hover"
                >
                  Delete for me
                </button>
                <button
                  onClick={handleDeleteForEveryone}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-chat-hover"
                >
                  Delete for everyone
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={cn("relative max-w-[65%]")}>
        {/* Reply Preview */}
        {message.replyTo && (
          <div
            className={cn(
              "px-3 py-2 rounded-t-lg border-l-4 border-primary-500 mb-0.5",
              message.isOwn
                ? "bg-chat-bubble-outgoing/70"
                : "bg-chat-bubble-incoming/70"
            )}
          >
            <p className="text-xs font-medium text-primary-400">
              {message.replyTo.sender?.username}
            </p>
            <p className="text-xs text-chat-text-muted truncate">
              {message.replyTo.content || `[${message.replyTo.type}]`}
            </p>
          </div>
        )}

        {/* Message Content */}
        <div
          className={cn(
            "px-3 py-2 rounded-lg",
            message.isOwn ? "bg-chat-bubble-outgoing" : "bg-chat-bubble-incoming",
            message.replyTo && "rounded-t-none"
          )}
        >
          {/* Sender name for group chats */}
          {!message.isOwn && message.sender && (
            <p className="text-xs font-medium text-primary-400 mb-1">
              {message.sender.firstName || message.sender.username}
            </p>
          )}

          {/* Edit mode */}
          {isEditing ? (
            <div className="flex items-end gap-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 bg-transparent text-chat-text-primary focus:outline-none resize-none"
                autoFocus
                rows={1}
              />
              <button onClick={handleEdit} className="p-1 text-primary-500">
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="p-1 text-chat-text-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Text Message */}
              {message.type === "text" && (
                <p className="text-chat-text-primary whitespace-pre-wrap break-words">
                  {message.content}
                </p>
              )}

              {/* Image Message */}
              {message.type === "image" && message.fileUrl && (
                <img
                  src={message.fileUrl}
                  alt="Image"
                  className="max-w-full rounded-lg cursor-pointer"
                  onClick={() => window.open(message.fileUrl, "_blank")}
                />
              )}

              {/* File Message */}
              {message.type === "file" && (
                <a
                  href={message.fileUrl}
                  download={message.fileName}
                  className="flex items-center gap-3 p-2 bg-black/20 rounded-lg hover:bg-black/30 transition-colors"
                >
                  <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                    <FileIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-chat-text-primary truncate">
                      {message.fileName}
                    </p>
                    <p className="text-xs text-chat-text-muted">
                      {formatFileSize(message.fileSize || 0)}
                    </p>
                  </div>
                  <Download className="w-5 h-5 text-chat-text-secondary" />
                </a>
              )}

              {/* Voice Message */}
              {message.type === "voice" && (
                <VoicePlayer
                  url={message.fileUrl}
                  duration={message.voiceDuration || 0}
                />
              )}
            </>
          )}

          {/* Time and Status */}
          <div className="flex items-center justify-end gap-1 mt-1">
            {message.isEdited && (
              <span className="text-xs text-chat-text-muted">edited</span>
            )}
            <span className="text-xs text-chat-text-muted">{time}</span>
            {message.isOwn && (
              <span className="text-primary-400">
                {message.readBy > 0 ? (
                  <CheckCheck className="w-4 h-4" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.reactions.map((reaction: any) => (
              <button
                key={reaction.emoji}
                onClick={() => handleReaction(reaction.emoji)}
                className="flex items-center gap-1 px-2 py-0.5 bg-chat-header rounded-full text-sm hover:bg-chat-hover transition-colors"
              >
                <span>{reaction.emoji}</span>
                <span className="text-xs text-chat-text-muted">
                  {reaction.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Emoji Picker for Reactions */}
        {showEmojiPicker && (
          <div
            className={cn(
              "absolute z-10",
              message.isOwn ? "right-0" : "left-0",
              "bottom-full mb-2"
            )}
          >
            <EmojiPicker
              onSelect={handleReaction}
              onClose={() => setShowEmojiPicker(false)}
              quickPick
            />
          </div>
        )}
      </div>

      {/* Actions Menu (right side for received messages) */}
      {!message.isOwn && showActions && (
        <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setShowEmojiPicker(true)}
            className="p-1.5 hover:bg-chat-hover rounded-full"
          >
            <Smile className="w-4 h-4 text-chat-text-muted" />
          </button>
          <button
            onClick={onReply}
            className="p-1.5 hover:bg-chat-hover rounded-full"
          >
            <Reply className="w-4 h-4 text-chat-text-muted" />
          </button>
          <button
            onClick={handleDeleteForMe}
            className="p-1.5 hover:bg-chat-hover rounded-full"
          >
            <Trash2 className="w-4 h-4 text-chat-text-muted" />
          </button>
        </div>
      )}
    </div>
  );
}

function VoicePlayer({ url, duration }: { url?: string; duration: number }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const handlePlayPause = () => {
    if (!url) return;

    if (!audio) {
      const newAudio = new Audio(url);
      newAudio.addEventListener("timeupdate", () => {
        setCurrentTime(newAudio.currentTime);
      });
      newAudio.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });
      setAudio(newAudio);
      newAudio.play();
      setIsPlaying(true);
    } else {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <button
        onClick={handlePlayPause}
        className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0"
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 text-white" />
        ) : (
          <Play className="w-5 h-5 text-white ml-0.5" />
        )}
      </button>
      <div className="flex-1">
        <div className="h-1.5 bg-black/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-400 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-chat-text-muted mt-1">
          {formatDuration(isPlaying ? currentTime : duration)}
        </p>
      </div>
    </div>
  );
}