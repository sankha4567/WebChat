"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Search, X, Check, Users, Loader2, ArrowRight } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectConversation: (id: Id<"conversations">) => void;
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  onSelectConversation,
}: CreateGroupDialogProps) {
  const [step, setStep] = useState<"members" | "details">("members");
  const [query, setQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Id<"users">[]>([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);

  const users = useQuery(api.users.searchUsers, { searchQuery: query }) || [];
  const createGroup = useMutation(api.conversations.createGroup);

  const toggleUser = (userId: Id<"users">) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;

    setLoading(true);
    try {
      const conversationId = await createGroup({
        name: groupName.trim(),
        memberIds: selectedUsers,
      });
      onSelectConversation(conversationId);
      handleClose();
    } catch (error) {
      console.error("Failed to create group:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep("members");
    setQuery("");
    setSelectedUsers([]);
    setGroupName("");
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20">
      <div className="bg-chat-sidebar w-full max-w-md rounded-lg shadow-xl animate-scale-in overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-chat-border bg-chat-header">
          <div className="flex items-center gap-3">
            {step === "details" && (
              <button
                onClick={() => setStep("members")}
                className="p-1 hover:bg-chat-hover rounded"
              >
                <X className="w-5 h-5 text-chat-text-muted" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-chat-text-primary">
              {step === "members" ? "Add Group Members" : "New Group"}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-chat-hover rounded"
          >
            <X className="w-5 h-5 text-chat-text-muted" />
          </button>
        </div>

        {step === "members" ? (
          <>
            {selectedUsers.length > 0 && (
              <div className="p-3 border-b border-chat-border flex flex-wrap gap-2">
                {selectedUsers.map((userId) => {
                  const user = users.find((u) => u._id === userId);
                  if (!user) return null;
                  return (
                    <button
                      key={userId}
                      onClick={() => toggleUser(userId)}
                      className="flex items-center gap-2 px-3 py-1 bg-primary-600 text-white rounded-full text-sm"
                    >
                      {user.firstName || user.username}
                      <X className="w-3 h-3" />
                    </button>
                  );
                })}
              </div>
            )}

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

            <div className="max-h-72 overflow-y-auto">
              {users.map((user) => (
                <button
                  key={user._id}
                  onClick={() => toggleUser(user._id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-chat-hover transition-colors"
                >
                  <div className="relative">
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
                    {selectedUsers.includes(user._id) && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
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
                </button>
              ))}
            </div>

            {selectedUsers.length > 0 && (
              <div className="p-4 border-t border-chat-border">
                <button
                  onClick={() => setStep("details")}
                  className="w-full py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="p-6">
            <div className="flex flex-col items-center mb-6">
              <div className="w-20 h-20 rounded-full bg-chat-input flex items-center justify-center mb-4">
                <Users className="w-10 h-10 text-chat-text-muted" />
              </div>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                className="w-full text-center text-xl font-medium bg-transparent text-chat-text-primary placeholder:text-chat-text-muted focus:outline-none border-b border-chat-border pb-2"
                autoFocus
              />
            </div>

            <div className="text-sm text-chat-text-secondary mb-4">
              {selectedUsers.length} participant
              {selectedUsers.length !== 1 ? "s" : ""}
            </div>

            <button
              onClick={handleCreate}
              disabled={!groupName.trim() || loading}
              className="w-full py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Create Group
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}