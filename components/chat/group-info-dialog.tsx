"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import {
  Crown,
  LogOut,
  MoreVertical,
  Search,
  ShieldOff,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { getInitials } from "@/lib/utils";

interface GroupInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: Id<"conversations">;
  onLeft?: () => void;
  // When true, the dialog opens directly into the add-members search panel
  // (used from the chat header's triple-dot "Add members" action).
  initialAddMode?: boolean;
}

type Member = Doc<"users"> & { isTyping?: boolean };

export function GroupInfoDialog({
  open,
  onOpenChange,
  conversationId,
  onLeft,
  initialAddMode = false,
}: GroupInfoDialogProps) {
  const conversation = useQuery(
    api.conversations.getConversation,
    open ? { conversationId } : "skip",
  );
  const me = useQuery(api.users.getCurrentUser, open ? {} : "skip");

  const removeMember = useMutation(api.conversations.removeGroupMember);
  const promoteToAdmin = useMutation(api.conversations.promoteToAdmin);
  const demoteFromAdmin = useMutation(api.conversations.demoteFromAdmin);
  const addMember = useMutation(api.conversations.addGroupMember);

  const [openMenuFor, setOpenMenuFor] = useState<Id<"users"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(initialAddMode);
  const [addQuery, setAddQuery] = useState("");

  // When the dialog reopens with initialAddMode=true (e.g. user clicks
  // "Add members" again from the header menu), reset the panel to that
  // state so it doesn't get stuck on the previous closed state.
  useEffect(() => {
    if (open) setAddMode(initialAddMode);
  }, [open, initialAddMode]);

  const candidateUsers = useQuery(
    api.users.searchUsers,
    open && addMode ? { searchQuery: addQuery } : "skip",
  );

  if (!open) return null;
  if (!conversation || !me) {
    return (
      <DialogShell title="Group info" onClose={() => onOpenChange(false)}>
        <div className="p-10 text-center text-sm text-chat-text-muted">
          Loading…
        </div>
      </DialogShell>
    );
  }

  // Resolve admin set, falling back to legacy adminId if adminIds is unset.
  const adminIds: Id<"users">[] =
    conversation.adminIds && conversation.adminIds.length > 0
      ? conversation.adminIds
      : conversation.adminId
        ? [conversation.adminId]
        : [];
  const adminSet = new Set(adminIds);
  const isAdmin = adminSet.has(me._id);
  const members = (conversation.members as Member[]) || [];

  // Sort: current user first, then admins, then alphabetical.
  const sortedMembers = [...members].sort((a, b) => {
    if (a._id === me._id) return -1;
    if (b._id === me._id) return 1;
    const aAdmin = adminSet.has(a._id);
    const bAdmin = adminSet.has(b._id);
    if (aAdmin && !bAdmin) return -1;
    if (!aAdmin && bAdmin) return 1;
    return (a.username || "").localeCompare(b.username || "");
  });

  const closeMenus = () => setOpenMenuFor(null);

  const wrap = async (op: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await op();
      closeMenus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = (userId: Id<"users">) =>
    wrap(async () => {
      await removeMember({ conversationId, userId });
    });

  const handlePromote = (userId: Id<"users">) =>
    wrap(async () => {
      await promoteToAdmin({ conversationId, userId });
    });

  const handleDemote = (userId: Id<"users">) =>
    wrap(async () => {
      await demoteFromAdmin({ conversationId, userId });
    });

  const handleAdd = (userId: Id<"users">) =>
    wrap(async () => {
      await addMember({ conversationId, userId });
    });

  const handleLeave = () =>
    wrap(async () => {
      await removeMember({ conversationId, userId: me._id });
      onOpenChange(false);
      onLeft?.();
    });

  return (
    <DialogShell title="Group info" onClose={() => onOpenChange(false)}>
      <div className="px-6 pt-6 pb-5 flex flex-col items-center gap-2 border-b border-chat-border">
        {conversation.groupImage ? (
          <img
            src={conversation.groupImage}
            alt={conversation.name || "Group"}
            className="w-24 h-24 rounded-full object-cover"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-primary-600 flex items-center justify-center text-white text-3xl font-semibold">
            {getInitials(conversation.name || "Group")}
          </div>
        )}
        <p className="text-xl font-semibold text-chat-text-primary text-center">
          {conversation.name}
        </p>
        <p className="text-xs text-chat-text-muted">
          Group · {members.length} {members.length === 1 ? "member" : "members"}
        </p>
        {isAdmin && (
          <span className="inline-flex items-center gap-1 text-xs text-primary-300 bg-primary-600/15 px-2 py-0.5 rounded-full">
            <Crown className="w-3 h-3" />
            You&apos;re the admin
          </span>
        )}
      </div>

      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <p className="text-xs uppercase tracking-wide text-chat-text-muted font-medium">
          Members
        </p>
        {!addMode && (
          <button
            onClick={() => {
              setAddMode(true);
              setAddQuery("");
            }}
            className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 px-2 py-1 rounded hover:bg-chat-hover"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add members
          </button>
        )}
      </div>

      {addMode && (
        <AddMembersPanel
          query={addQuery}
          onQueryChange={setAddQuery}
          onClose={() => {
            setAddMode(false);
            setAddQuery("");
            setError(null);
          }}
          candidates={candidateUsers ?? []}
          existingMemberIds={new Set(members.map((m) => m._id))}
          busy={busy}
          onAdd={handleAdd}
        />
      )}

      <div className="max-h-[320px] overflow-y-auto pb-2">
        {sortedMembers.map((m) => {
          const isMemberAdmin = adminSet.has(m._id);
          const isMe = m._id === me._id;
          const showMenu = isAdmin && !isMe;
          // Last admin protection — same rule the server enforces, mirrored
          // in the UI so we can disable the demote action explicitly.
          const isLastAdmin = isMemberAdmin && adminIds.length === 1;

          return (
            <div
              key={m._id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-chat-hover/40 transition-colors"
            >
              <div className="relative flex-shrink-0">
                {m.imageUrl ? (
                  <img
                    src={m.imageUrl}
                    alt={m.username}
                    className="w-11 h-11 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
                    {getInitials(m.username)}
                  </div>
                )}
                {m.isOnline && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-chat-sidebar" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-chat-text-primary font-medium truncate">
                    {isMe
                      ? "You"
                      : m.firstName || m.lastName
                        ? `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim()
                        : m.username}
                  </span>
                  {isMemberAdmin && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide bg-primary-600/20 text-primary-300 px-2 py-0.5 rounded-full flex-shrink-0">
                      <Crown className="w-3 h-3" />
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-chat-text-muted truncate">
                  {m.status?.trim() ||
                    (m.isOnline ? "online" : `@${m.username}`)}
                </p>
              </div>

              {showMenu && (
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() =>
                      setOpenMenuFor(openMenuFor === m._id ? null : m._id)
                    }
                    className="p-1.5 hover:bg-chat-hover rounded-full text-chat-text-muted disabled:opacity-50"
                    aria-label="Member actions"
                    disabled={busy}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {openMenuFor === m._id && (
                    <div className="absolute right-0 top-full mt-1 py-1 bg-chat-header rounded-lg shadow-xl border border-chat-border z-10 min-w-[200px]">
                      {!isMemberAdmin ? (
                        <button
                          onClick={() => handlePromote(m._id)}
                          className="w-full px-4 py-2 text-left text-sm text-chat-text-primary hover:bg-chat-hover flex items-center gap-2"
                        >
                          <Crown className="w-4 h-4" />
                          Make admin
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDemote(m._id)}
                          disabled={isLastAdmin}
                          className="w-full px-4 py-2 text-left text-sm text-chat-text-primary hover:bg-chat-hover flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            isLastAdmin
                              ? "Can't demote the only admin"
                              : undefined
                          }
                        >
                          <ShieldOff className="w-4 h-4" />
                          Remove as admin
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(m._id)}
                        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-chat-hover flex items-center gap-2"
                      >
                        <UserMinus className="w-4 h-4" />
                        Remove from group
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="px-6 py-2 text-xs text-red-400 bg-red-500/10 border-t border-chat-border">
          {error}
        </div>
      )}

      <div className="p-4 border-t border-chat-border">
        {/* Block leaving only when the user is the *last* admin — multiple
            admins means anyone can leave freely. */}
        {(() => {
          const isLastAdmin = isAdmin && adminIds.length === 1;
          return (
            <>
              <button
                onClick={handleLeave}
                disabled={busy || isLastAdmin}
                className="w-full py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <LogOut className="w-4 h-4" />
                Leave group
              </button>
              {isLastAdmin && (
                <p className="text-xs text-chat-text-muted text-center mt-2">
                  You&apos;re the only admin. Promote another member before
                  leaving.
                </p>
              )}
            </>
          );
        })()}
      </div>
    </DialogShell>
  );
}

interface AddMembersPanelProps {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  candidates: Doc<"users">[];
  existingMemberIds: Set<Id<"users">>;
  busy: boolean;
  onAdd: (userId: Id<"users">) => Promise<void> | void;
}

function AddMembersPanel({
  query,
  onQueryChange,
  onClose,
  candidates,
  existingMemberIds,
  busy,
  onAdd,
}: AddMembersPanelProps) {
  const filtered = useMemo(
    () => candidates.filter((u) => !existingMemberIds.has(u._id)),
    [candidates, existingMemberIds],
  );

  return (
    <div className="px-4 pb-2 border-b border-chat-border">
      <div className="flex items-center gap-2 px-3 py-2 bg-chat-input rounded-lg">
        <Search className="w-4 h-4 text-chat-text-muted flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search users to add..."
          className="flex-1 bg-transparent text-chat-text-primary placeholder:text-chat-text-muted focus:outline-none text-sm"
          autoFocus
        />
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-chat-hover rounded"
          aria-label="Cancel adding members"
        >
          <X className="w-4 h-4 text-chat-text-muted" />
        </button>
      </div>

      <div className="mt-2 max-h-[200px] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-xs text-chat-text-muted">
            {query.trim()
              ? "No matching users (already in the group?)"
              : "Start typing a name to find users."}
          </p>
        ) : (
          filtered.map((u) => (
            <button
              key={u._id}
              onClick={() => onAdd(u._id)}
              disabled={busy}
              className="w-full flex items-center gap-3 px-2 py-2 hover:bg-chat-hover/40 rounded-lg disabled:opacity-50 transition-colors"
            >
              {u.imageUrl ? (
                <img
                  src={u.imageUrl}
                  alt={u.username}
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                  {getInitials(u.username)}
                </div>
              )}
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm text-chat-text-primary truncate">
                  {u.firstName && u.lastName
                    ? `${u.firstName} ${u.lastName}`
                    : u.username}
                </p>
                <p className="text-xs text-chat-text-muted truncate">
                  @{u.username}
                </p>
              </div>
              <UserPlus className="w-4 h-4 text-primary-400 flex-shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function DialogShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-16">
      <div className="bg-chat-sidebar w-full max-w-md rounded-xl shadow-2xl animate-scale-in overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-chat-border bg-chat-header">
          <h2 className="text-base font-semibold text-chat-text-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-chat-hover rounded-full"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-chat-text-muted" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
