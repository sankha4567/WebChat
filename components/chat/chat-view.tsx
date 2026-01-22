"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Search,
  Paperclip,
  Mic,
  Send,
  Smile,
  X,
  Loader2,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { MessageBubble } from "./message-bubble";
import { EmojiPicker } from "./emoji-picker";
import { VoiceRecorder } from "./voice-recorder";
import { FileUpload } from "./file-upload";

interface ChatViewProps {
  conversationId: Id<"conversations">;
  onBack?: () => void;
}

export function ChatView({ conversationId, onBack }: ChatViewProps) {
  const [message, setMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const conversation = useQuery(api.conversations.getConversation, {
    conversationId,
  });
  const messages = useQuery(api.messages.getMessages, { conversationId });

  const sendMessage = useMutation(api.messages.sendMessage);
  const markAsRead = useMutation(api.conversations.markAsRead);
  const updateTyping = useMutation(api.conversations.updateTypingStatus);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (conversationId) {
      markAsRead({ conversationId });
    }
  }, [conversationId, messages, markAsRead]);

  const handleTyping = useCallback(() => {
    updateTyping({ conversationId, isTyping: true });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      updateTyping({ conversationId, isTyping: false });
    }, 2000);
  }, [conversationId, updateTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      updateTyping({ conversationId, isTyping: false });
    };
  }, [conversationId, updateTyping]);

  const handleSend = async () => {
    if (!message.trim()) return;

    try {
      await sendMessage({
        conversationId,
        content: message.trim(),
        type: "text",
        replyToId: replyTo?._id,
      });
      setMessage("");
      setReplyTo(null);
      updateTyping({ conversationId, isTyping: false });
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-chat-bg">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  const displayName = conversation.isGroup
    ? conversation.name
    : conversation.otherUser?.firstName ||
      conversation.otherUser?.username ||
      "Unknown";

  const displayImage = conversation.isGroup
    ? conversation.groupImage
    : conversation.otherUser?.imageUrl;

  const isOnline = !conversation.isGroup && conversation.otherUser?.isOnline;

  const lastSeen = conversation.otherUser?.lastSeen
    ? formatDistanceToNow(new Date(conversation.otherUser.lastSeen), {
        addSuffix: true,
      })
    : null;

  const typingText =
    conversation.typingUsers && conversation.typingUsers.length > 0
      ? conversation.isGroup
        ? `${conversation.typingUsers.map((u: any) => u.firstName || u.username).join(", ")} ${conversation.typingUsers.length === 1 ? "is" : "are"} typing...`
        : "typing..."
      : null;

  const groupedMessages: { date: string; messages: any[] }[] = [];
  let currentDate = "";

  messages?.forEach((msg) => {
    if (!msg) return; // Skip null messages
    const msgDate = new Date(msg.createdAt);
    const dateStr = isToday(msgDate)
      ? "Today"
      : isYesterday(msgDate)
        ? "Yesterday"
        : format(msgDate, "MMMM d, yyyy");

    if (dateStr !== currentDate) {
      currentDate = dateStr;
      groupedMessages.push({ date: dateStr, messages: [] });
    }
    groupedMessages[groupedMessages.length - 1].messages.push(msg);
  });

  return (
    <div className="flex flex-col h-full bg-chat-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-chat-header border-b border-chat-border">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 -ml-2 hover:bg-chat-hover rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-chat-text-secondary" />
            </button>
          )}
          {displayImage ? (
            <img
              src={displayImage}
              alt={displayName || "User"}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
              {getInitials(displayName || "?")}
            </div>
          )}
          <div>
            <h2 className="text-chat-text-primary font-medium">{displayName}</h2>
            <p className="text-xs text-chat-text-muted">
              {typingText ? (
                <span className="text-primary-500">{typingText}</span>
              ) : isOnline ? (
                "online"
              ) : lastSeen ? (
                `last seen ${lastSeen}`
              ) : conversation.isGroup ? (
                `${conversation.members?.length} members`
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-chat-hover rounded-full transition-colors">
            <Video className="w-5 h-5 text-chat-text-secondary" />
          </button>
          <button className="p-2 hover:bg-chat-hover rounded-full transition-colors">
            <Phone className="w-5 h-5 text-chat-text-secondary" />
          </button>
          <button className="p-2 hover:bg-chat-hover rounded-full transition-colors">
            <Search className="w-5 h-5 text-chat-text-secondary" />
          </button>
          <button className="p-2 hover:bg-chat-hover rounded-full transition-colors">
            <MoreVertical className="w-5 h-5 text-chat-text-secondary" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto chat-bg-pattern px-4 py-2">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            <div className="flex items-center justify-center my-4">
              <span className="px-3 py-1 bg-chat-header rounded-lg text-xs text-chat-text-muted">
                {group.date}
              </span>
            </div>
            {group.messages.map((msg) => (
              <MessageBubble
                key={msg._id}
                message={msg}
                conversationId={conversationId}
                onReply={() => setReplyTo(msg)}
              />
            ))}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Preview */}
      {replyTo && (
        <div className="px-4 py-2 bg-chat-header border-t border-chat-border flex items-center gap-3">
          <div className="w-1 h-10 bg-primary-500 rounded-full" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary-500">
              {replyTo.isOwn ? "You" : replyTo.sender?.username}
            </p>
            <p className="text-sm text-chat-text-muted truncate">
              {replyTo.content || `[${replyTo.type}]`}
            </p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="p-1 hover:bg-chat-hover rounded"
          >
            <X className="w-5 h-5 text-chat-text-muted" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="px-4 py-3 bg-chat-header border-t border-chat-border">
        {isRecording ? (
          <VoiceRecorder
            conversationId={conversationId}
            onCancel={() => setIsRecording(false)}
            onSend={() => setIsRecording(false)}
          />
        ) : (
          <div className="flex items-end gap-2">
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-2 hover:bg-chat-hover rounded-full transition-colors"
              >
                <Smile className="w-6 h-6 text-chat-text-secondary" />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-12 left-0 z-10">
                  <EmojiPicker
                    onSelect={handleEmojiSelect}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setShowFileUpload(!showFileUpload)}
                className="p-2 hover:bg-chat-hover rounded-full transition-colors"
              >
                <Paperclip className="w-6 h-6 text-chat-text-secondary" />
              </button>
              {showFileUpload && (
                <FileUpload
                  conversationId={conversationId}
                  onClose={() => setShowFileUpload(false)}
                />
              )}
            </div>

            <div className="flex-1 bg-chat-input rounded-lg px-4 py-2">
              <textarea
                ref={inputRef}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  handleTyping();
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a message"
                rows={1}
                className="w-full bg-transparent text-chat-text-primary placeholder:text-chat-text-muted focus:outline-none resize-none max-h-32"
                style={{ minHeight: "24px" }}
              />
            </div>

            {message.trim() ? (
              <button
                onClick={handleSend}
                className="p-2 bg-primary-600 hover:bg-primary-700 rounded-full transition-colors"
              >
                <Send className="w-6 h-6 text-white" />
              </button>
            ) : (
              <button
                onClick={() => setIsRecording(true)}
                className="p-2 hover:bg-chat-hover rounded-full transition-colors"
              >
                <Mic className="w-6 h-6 text-chat-text-secondary" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}