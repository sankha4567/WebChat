"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useUser, UserButton } from "@clerk/nextjs";
import { Search, MessageSquarePlus, Users, UserCog } from "lucide-react";
import { cn, formatChatTimestamp, getInitials } from "@/lib/utils";
import { SearchDialog } from "./search-dialog";
import { NewChatDialog } from "./new-chat-dialog";
import { CreateGroupDialog } from "./create-group-dialog";
import { ProfileDialog } from "./profile-dialog";

interface SidebarProps {
  selectedConversationId: Id<"conversations"> | null;
  onSelectConversation: (id: Id<"conversations">) => void;
}

export function Sidebar({
  selectedConversationId,
  onSelectConversation,
}: SidebarProps) {
  const { user } = useUser();
  const me = useQuery(api.users.getCurrentUser);
  const conversations = useQuery(api.conversations.getConversations) || [];
  const [searchOpen, setSearchOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className="flex flex-col h-full bg-chat-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-chat-header">
        <div className="flex items-center gap-3">
          <UserButton afterSignOutUrl="/sign-in">
            <UserButton.MenuItems>
              <UserButton.Action
                label="Profile"
                labelIcon={<UserCog className="w-4 h-4" />}
                onClick={() => setProfileOpen(true)}
              />
            </UserButton.MenuItems>
          </UserButton>
          <button
            onClick={() => setProfileOpen(true)}
            className="flex flex-col items-start hover:bg-chat-hover px-2 py-1 -ml-2 rounded transition-colors text-left max-w-[160px]"
            aria-label="Open your profile"
          >
            <span className="text-chat-text-primary font-medium truncate">
              {user?.firstName || user?.username || "Chat"}
            </span>
            {me?.status?.trim() && (
              <span className="text-xs text-chat-text-muted truncate w-full">
                {me.status}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateGroupOpen(true)}
            className="p-2 rounded-full hover:bg-chat-hover transition-colors"
            title="Create group"
          >
            <Users className="w-5 h-5 text-chat-text-secondary" />
          </button>
          <button
            onClick={() => setNewChatOpen(true)}
            className="p-2 rounded-full hover:bg-chat-hover transition-colors"
            title="New chat"
          >
            <MessageSquarePlus className="w-5 h-5 text-chat-text-secondary" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3 py-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-2 bg-chat-input rounded-lg text-chat-text-muted hover:bg-chat-hover transition-colors"
        >
          <Search className="w-4 h-4" />
          <span className="text-sm">Search or start new chat</span>
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-chat-text-muted px-8 text-center">
            <MessageSquarePlus className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs mt-1">
              Start a new chat to begin messaging
            </p>
          </div>
        ) : (
          conversations.map((conversation) => {
            if (!conversation) return null;

            const displayName = conversation.isGroup
              ? conversation.name
              : conversation.otherUser?.firstName ||
                conversation.otherUser?.username ||
                "Unknown";

            const displayImage = conversation.isGroup
              ? conversation.groupImage
              : conversation.otherUser?.imageUrl;

            const isOnline =
              !conversation.isGroup && conversation.otherUser?.isOnline;

            const last = conversation.lastMessage;
            let lastMessageText = "No messages yet";
            if (last) {
              if (last.deletedForEveryone) {
                lastMessageText = "🚫 This message was deleted";
              } else if (last.type === "reaction") {
                const reactor =
                  last.sender?._id === me?._id
                    ? "You"
                    : last.sender?.firstName || last.sender?.username || "Someone";
                const target = last.content ? `: "${last.content}"` : "";
                lastMessageText = `${reactor} reacted ${last.reactionEmoji ?? ""} to${target}`;
              } else if (last.type === "image") {
                lastMessageText = "📷 Photo";
              } else if (last.type === "file") {
                lastMessageText = "📎 File";
              } else if (last.type === "voice") {
                lastMessageText = "🎤 Voice message";
              } else if (last.type === "system") {
                lastMessageText = last.content ?? "";
              } else {
                lastMessageText = last.content ?? "";
              }
            }

            const typingText =
              conversation.typingUsers && conversation.typingUsers.length > 0
                ? conversation.isGroup
                  ? `${conversation.typingUsers[0]?.firstName || conversation.typingUsers[0]?.username} is typing...`
                  : "typing..."
                : null;

            return (
              <button
                key={conversation._id}
                onClick={() => onSelectConversation(conversation._id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 hover:bg-chat-hover transition-colors border-b border-chat-border",
                  selectedConversationId === conversation._id && "bg-chat-hover"
                )}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {displayImage ? (
                    <img
                      src={displayImage}
                      alt={displayName || "User"}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
                      {getInitials(displayName || "?")}
                    </div>
                  )}
                  {isOnline && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary-500 rounded-full border-2 border-chat-sidebar" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-chat-text-primary font-medium truncate">
                      {displayName}
                    </span>
                    {conversation.lastMessage && (
                      <span className="text-xs text-chat-text-muted flex-shrink-0 ml-2">
                        {formatChatTimestamp(conversation.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span
                      className={cn(
                        "text-sm truncate",
                        typingText
                          ? "text-primary-500"
                          : "text-chat-text-secondary"
                      )}
                    >
                      {typingText || lastMessageText}
                    </span>
                    {conversation.unreadCount > 0 && (
                      <span className="flex-shrink-0 ml-2 px-2 py-0.5 bg-primary-500 text-white text-xs font-medium rounded-full">
                        {conversation.unreadCount > 99
                          ? "99+"
                          : conversation.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Dialogs */}
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onSelectConversation={onSelectConversation}
      />
      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        onSelectConversation={onSelectConversation}
      />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}