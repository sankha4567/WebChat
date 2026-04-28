"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { FunctionReturnType } from "convex/server";
import { format, isToday, isYesterday } from "date-fns";
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
  ChevronsDown,
  Info,
  UserPlus,
  Eraser,
} from "lucide-react";
import { formatLastSeen, getInitials } from "@/lib/utils";
import { MessageBubble } from "./message-bubble";
import { EmojiPicker } from "./emoji-picker";
import { VoiceRecorder } from "./voice-recorder";
import { FileUpload } from "./file-upload";
import { ReplyPreviewBody } from "./reply-preview-body";
import { GroupInfoDialog } from "./group-info-dialog";
import { UserInfoDialog } from "./user-info-dialog";

type Message = NonNullable<
  FunctionReturnType<typeof api.messages.getMessages>[number]
>;

interface ChatViewProps {
  conversationId: Id<"conversations">;
  onBack?: () => void;
}

const SCROLL_BOTTOM_THRESHOLD = 100;

export function ChatView({ conversationId, onBack }: ChatViewProps) {
  const [message, setMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [groupInfoStartInAddMode, setGroupInfoStartInAddMode] = useState(false);
  const [userInfoOpen, setUserInfoOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Mirror of isAtBottom state so the scroll handler reads it without races.
  const isAtBottomRef = useRef(true);
  const lastMessageCountRef = useRef(0);

  const conversation = useQuery(api.conversations.getConversation, {
    conversationId,
  });
  const messages = useQuery(api.messages.getMessages, { conversationId });

  const sendMessage = useMutation(api.messages.sendMessage);
  const markAsRead = useMutation(api.conversations.markAsRead);
  const updateTyping = useMutation(api.conversations.updateTypingStatus);
  const clearConversation = useMutation(api.messages.clearConversationForMe);

  // Per-conversation UI state is reset by remounting on conversationId change
  // (parent passes `key={conversationId}`), so no manual reset effect needed.

  // Track whether the user is pinned to the bottom of the thread; if they've
  // scrolled up to read history, don't yank them back on every new message.
  // Reaching the bottom by scrolling clears any "new messages" badge.
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    if (atBottom) setUnseenCount(0);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setUnseenCount(0);
  }, []);

  // Auto-scroll only when (a) a new message arrived AND the user was already
  // at the bottom, or (b) it's an own message we just sent. Otherwise, count
  // the new arrivals so we can show a "jump to bottom" badge.
  useEffect(() => {
    if (!messages) return;
    const prev = lastMessageCountRef.current;
    const grew = messages.length > prev;
    const arrivals = grew ? messages.length - prev : 0;
    const last = messages[messages.length - 1];
    const isOwnTail = last?.isOwn ?? false;

    if (grew && (isAtBottomRef.current || isOwnTail)) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (grew && !isOwnTail) {
      // Don't count own messages — they always pin to bottom anyway.
      const incomingArrivals = messages
        .slice(prev)
        .filter((m) => !m.isOwn).length;
      if (incomingArrivals > 0) {
        setUnseenCount((c) => c + incomingArrivals);
      }
    }

    // If the user is actively in the chat (tab visible + scrolled to bottom)
    // and an incoming message just arrived, mark it read immediately so the
    // sidebar unread badge doesn't briefly flash. Safe to call on every
    // new-message tick: markAsRead patches conversationMembers.lastReadTime,
    // which doesn't invalidate the messages query — no feedback loop.
    if (
      grew &&
      !isOwnTail &&
      isAtBottomRef.current &&
      typeof document !== "undefined" &&
      !document.hidden
    ) {
      markAsRead({ conversationId });
    }

    lastMessageCountRef.current = messages.length;
    // arrivals is referenced for clarity but the slice above is the source of truth.
    void arrivals;
  }, [messages, conversationId, markAsRead]);

  // Mark as read once per conversation open and on window focus.
  // Do NOT depend on `messages` — that fires on every realtime tick and
  // produces a write-amplification feedback loop across all peers.
  useEffect(() => {
    if (!conversationId) return;
    markAsRead({ conversationId });
    const onFocus = () => markAsRead({ conversationId });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [conversationId, markAsRead]);

  const handleTyping = useCallback(() => {
    updateTyping({ conversationId, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      updateTyping({ conversationId, isTyping: false });
    }, 2000);
  }, [conversationId, updateTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      updateTyping({ conversationId, isTyping: false });
    };
  }, [conversationId, updateTyping]);

  // Close the header dropdown when clicking outside it.
  useEffect(() => {
    if (!headerMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        headerMenuRef.current &&
        !headerMenuRef.current.contains(e.target as Node)
      ) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [headerMenuOpen]);

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
    } catch (err) {
      // Surface to user; keep the draft so they can retry.
      const msg = err instanceof Error ? err.message : "Failed to send message";
      console.warn(msg);
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
    ? formatLastSeen(conversation.otherUser.lastSeen)
    : null;

  const typingText =
    conversation.typingUsers && conversation.typingUsers.length > 0
      ? conversation.isGroup
        ? `${conversation.typingUsers
            .map((u) => u.firstName || u.username)
            .join(", ")} ${conversation.typingUsers.length === 1 ? "is" : "are"} typing...`
        : "typing..."
      : null;

  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = "";

  messages?.forEach((msg) => {
    if (!msg) return;
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
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-chat-text-secondary" />
            </button>
          )}
          <button
            onClick={() => {
              if (conversation.isGroup) setGroupInfoOpen(true);
              else if (conversation.otherUser) setUserInfoOpen(true);
            }}
            className="flex items-center gap-3 -ml-1 pl-1 pr-2 py-1 rounded-lg hover:bg-chat-hover cursor-pointer"
            aria-label={conversation.isGroup ? "Group info" : "Contact info"}
          >
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
            <div className="text-left">
              <h2 className="text-chat-text-primary font-medium">
                {displayName}
              </h2>
              <p className="text-xs text-chat-text-muted">
                {typingText ? (
                  <span className="text-primary-500">{typingText}</span>
                ) : isOnline ? (
                  "online"
                ) : lastSeen ? (
                  `last seen ${lastSeen}`
                ) : conversation.isGroup ? (
                  `${conversation.members?.length} members${
                    conversation.members?.length
                      ? " · tap for info"
                      : ""
                  }`
                ) : null}
              </p>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-chat-hover rounded-full transition-colors" aria-label="Video call">
            <Video className="w-5 h-5 text-chat-text-secondary" />
          </button>
          <button className="p-2 hover:bg-chat-hover rounded-full transition-colors" aria-label="Voice call">
            <Phone className="w-5 h-5 text-chat-text-secondary" />
          </button>
          <button className="p-2 hover:bg-chat-hover rounded-full transition-colors" aria-label="Search in chat">
            <Search className="w-5 h-5 text-chat-text-secondary" />
          </button>
          <div className="relative" ref={headerMenuRef}>
            <button
              onClick={() => setHeaderMenuOpen((o) => !o)}
              className="p-2 hover:bg-chat-hover rounded-full transition-colors"
              aria-label="More options"
              aria-expanded={headerMenuOpen}
            >
              <MoreVertical className="w-5 h-5 text-chat-text-secondary" />
            </button>
            {headerMenuOpen && (
              <div className="absolute right-0 top-full mt-1 py-1 bg-chat-header rounded-lg shadow-xl border border-chat-border z-20 min-w-[180px]">
                <button
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    if (conversation.isGroup) {
                      setGroupInfoStartInAddMode(false);
                      setGroupInfoOpen(true);
                    } else {
                      setUserInfoOpen(true);
                    }
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-chat-text-primary hover:bg-chat-hover flex items-center gap-2"
                >
                  <Info className="w-4 h-4" />
                  {conversation.isGroup ? "Group info" : "Contact info"}
                </button>
                {conversation.isGroup && !conversation.viewerLeft && (
                  <button
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      setGroupInfoStartInAddMode(true);
                      setGroupInfoOpen(true);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-chat-text-primary hover:bg-chat-hover flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    Add members
                  </button>
                )}
                <button
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    if (
                      typeof window !== "undefined" &&
                      window.confirm(
                        "Clear all messages from your view of this chat? Other participants will still see them.",
                      )
                    ) {
                      void clearConversation({ conversationId });
                    }
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-chat-hover flex items-center gap-2"
                >
                  <Eraser className="w-4 h-4" />
                  Clear chat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="relative flex-1 overflow-hidden">
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto chat-bg-pattern px-4 py-2"
      >
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
                isGroup={conversation.isGroup}
                isGroupAdmin={
                  conversation.isGroup &&
                  (() => {
                    const myId = conversation.currentMembership?.userId;
                    if (!myId) return false;
                    if (
                      conversation.adminIds &&
                      conversation.adminIds.length > 0
                    ) {
                      return conversation.adminIds.some((id) => id === myId);
                    }
                    return conversation.adminId === myId;
                  })()
                }
                onReply={() => setReplyTo(msg)}
              />
            ))}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

        {/* Jump-to-bottom badge — surfaces when the user has scrolled up
            and new incoming messages have piled up below. */}
        {(!isAtBottom || unseenCount > 0) && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-4 right-4 w-11 h-11 rounded-full bg-chat-header border border-chat-border shadow-lg flex items-center justify-center hover:bg-chat-hover transition-colors"
            aria-label={
              unseenCount > 0
                ? `${unseenCount} new messages — scroll to bottom`
                : "Scroll to bottom"
            }
          >
            <ChevronsDown className="w-5 h-5 text-chat-text-secondary" />
            {unseenCount > 0 && (
              <span className="absolute -top-1 -left-1 min-w-[20px] h-5 px-1 rounded-full bg-primary-500 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                {unseenCount > 99 ? "99+" : unseenCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Reply Preview */}
      {replyTo && (
        <div className="px-4 py-2 bg-chat-header border-t border-chat-border flex items-center gap-3">
          <div className="w-1 h-10 bg-primary-500 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <ReplyPreviewBody
              message={replyTo}
              senderLabel={
                replyTo.isOwn ? "You" : replyTo.sender?.username || "Unknown"
              }
            />
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="p-1 hover:bg-chat-hover rounded flex-shrink-0"
            aria-label="Cancel reply"
          >
            <X className="w-5 h-5 text-chat-text-muted" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="px-4 py-3 bg-chat-header border-t border-chat-border">
        {conversation.viewerLeft ? (
          <p className="py-2 text-center text-sm text-chat-text-muted">
            You can&apos;t send messages in this conversation.
          </p>
        ) : isRecording ? (
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
                aria-label="Insert emoji"
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
                aria-label="Attach file"
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
                aria-label="Message"
                className="w-full bg-transparent text-chat-text-primary placeholder:text-chat-text-muted focus:outline-none resize-none max-h-32"
                style={{ minHeight: "24px" }}
              />
            </div>

            {message.trim() ? (
              <button
                onClick={handleSend}
                className="p-2 bg-primary-600 hover:bg-primary-700 rounded-full transition-colors"
                aria-label="Send message"
              >
                <Send className="w-6 h-6 text-white" />
              </button>
            ) : (
              <button
                onClick={() => setIsRecording(true)}
                className="p-2 hover:bg-chat-hover rounded-full transition-colors"
                aria-label="Record voice message"
              >
                <Mic className="w-6 h-6 text-chat-text-secondary" />
              </button>
            )}
          </div>
        )}
      </div>

      {conversation.isGroup ? (
        <GroupInfoDialog
          open={groupInfoOpen}
          onOpenChange={(o) => {
            setGroupInfoOpen(o);
            if (!o) setGroupInfoStartInAddMode(false);
          }}
          conversationId={conversationId}
          onLeft={onBack}
          initialAddMode={groupInfoStartInAddMode}
        />
      ) : (
        <UserInfoDialog
          open={userInfoOpen}
          onOpenChange={setUserInfoOpen}
          user={conversation.otherUser}
        />
      )}
    </div>
  );
}
