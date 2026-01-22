"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Search, X, Loader2 } from "lucide-react";
import { getInitials } from "@/lib/utils";

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectConversation: (id: Id<"conversations">) => void;
}

export function NewChatDialog({
  open,
  onOpenChange,
  onSelectConversation,
}: NewChatDialogProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  const users = useQuery(api.users.searchUsers, { searchQuery: query }) || [];
  const createConversation = useMutation(
    api.conversations.getOrCreateDirectConversation
  );

  const handleSelectUser = async (userId: Id<"users">) => {
    setLoading(userId);
    try {
      const conversationId = await createConversation({ otherUserId: userId });
      onSelectConversation(conversationId);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    } finally {
      setLoading(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20">
      <div className="bg-chat-sidebar w-full max-w-md rounded-lg shadow-xl animate-scale-in overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-chat-border">
          <h2 className="text-lg font-semibold text-chat-text-primary">
            New Chat
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 hover:bg-chat-hover rounded"
          >
            <X className="w-5 h-5 text-chat-text-muted" />
          </button>
        </div>

        <div className="p-4 border-b border-chat-border">
          <div className="flex items-center gap-3 px-4 py-2 bg-chat-input rounded-lg">
            <Search className="w-4 h-4 text-chat-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users..."
              className="flex-1 bg-transparent text-chat-text-primary placeholder:text-chat-text-muted focus:outline-none text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {users.length === 0 ? (
            <div className="p-8 text-center text-chat-text-muted">
              {query ? "No users found" : "Search for users to start a chat"}
            </div>
          ) : (
            users.map((user) => (
              <button
                key={user._id}
                onClick={() => handleSelectUser(user._id)}
                disabled={loading !== null}
                className="w-full flex items-center gap-3 p-4 hover:bg-chat-hover transition-colors disabled:opacity-50"
              >
                {user.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt={user.username}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
                    {getInitials(user.username)}
                  </div>
                )}
                <div className="flex-1 text-left">
                  <div className="text-chat-text-primary font-medium">
                    {user.firstName && user.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : user.username}
                  </div>
                  <div className="text-sm text-chat-text-secondary">
                    @{user.username}
                  </div>
                </div>
                {loading === user._id ? (
                  <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                ) : user.isOnline ? (
                  <div className="w-2 h-2 bg-primary-500 rounded-full" />
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}