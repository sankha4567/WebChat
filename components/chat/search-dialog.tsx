"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search, X, MessageSquare, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn, getInitials } from "@/lib/utils";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"messages" | "users">("messages");

  const messageResults = useQuery(
    api.messages.searchMessages,
    query.length > 0 ? { searchQuery: query } : "skip"
  );

  const userResults = useQuery(
    api.users.searchUsers,
    query.length > 0 ? { searchQuery: query } : "skip"
  );

  // Reset state in render rather than an effect (React 19 idiom): when the
  // parent flips `open` we drain the search box without an extra render.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setQuery("");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20">
      <div className="bg-chat-sidebar w-full max-w-lg rounded-lg shadow-xl animate-scale-in overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-chat-border">
          <Search className="w-5 h-5 text-chat-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages or users..."
            className="flex-1 bg-transparent text-chat-text-primary placeholder:text-chat-text-muted focus:outline-none"
            autoFocus
          />
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 hover:bg-chat-hover rounded"
          >
            <X className="w-5 h-5 text-chat-text-muted" />
          </button>
        </div>

        <div className="flex border-b border-chat-border">
          <button
            onClick={() => setActiveTab("messages")}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-colors",
              activeTab === "messages"
                ? "text-primary-500 border-b-2 border-primary-500"
                : "text-chat-text-muted hover:text-chat-text-primary"
            )}
          >
            <MessageSquare className="w-4 h-4 inline-block mr-2" />
            Messages
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-colors",
              activeTab === "users"
                ? "text-primary-500 border-b-2 border-primary-500"
                : "text-chat-text-muted hover:text-chat-text-primary"
            )}
          >
            <User className="w-4 h-4 inline-block mr-2" />
            Users
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {query.length === 0 ? (
            <div className="p-8 text-center text-chat-text-muted">
              Start typing to search...
            </div>
          ) : activeTab === "messages" ? (
            messageResults && messageResults.length > 0 ? (
              messageResults.map((result) => (
                <button
                  key={result._id}
                  className="w-full flex items-start gap-3 p-4 hover:bg-chat-hover transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm flex-shrink-0">
                    {getInitials(result.sender?.username || "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-chat-text-primary font-medium">
                        {result.conversation?.isGroup
                          ? result.conversation.name
                          : result.conversation?.otherUser?.username ||
                            "Unknown"}
                      </span>
                      <span className="text-xs text-chat-text-muted">
                        {formatDistanceToNow(new Date(result.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-chat-text-secondary truncate mt-0.5">
                      {result.content}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-8 text-center text-chat-text-muted">
                No messages found
              </div>
            )
          ) : userResults && userResults.length > 0 ? (
            userResults.map((user) => (
              <button
                key={user._id}
                className="w-full flex items-center gap-3 p-4 hover:bg-chat-hover transition-colors"
              >
                {user.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt={user.username}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm">
                    {getInitials(user.username)}
                  </div>
                )}
                <div className="text-left">
                  <div className="text-chat-text-primary font-medium">
                    {user.firstName && user.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : user.username}
                  </div>
                  <div className="text-sm text-chat-text-secondary">
                    @{user.username}
                  </div>
                </div>
                {user.isOnline && (
                  <div className="ml-auto w-2 h-2 bg-primary-500 rounded-full" />
                )}
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-chat-text-muted">
              No users found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}