"use client";

import { Doc } from "@/convex/_generated/dataModel";
import { formatDistanceToNow } from "date-fns";
import { AtSign, Circle, Mail, X } from "lucide-react";
import { getInitials } from "@/lib/utils";

interface UserInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: Doc<"users"> | null | undefined;
}

export function UserInfoDialog({
  open,
  onOpenChange,
  user,
}: UserInfoDialogProps) {
  if (!open) return null;

  const close = () => onOpenChange(false);

  if (!user) {
    return (
      <DialogShell title="Contact info" onClose={close}>
        <div className="p-10 text-center text-sm text-chat-text-muted">
          User not available.
        </div>
      </DialogShell>
    );
  }

  const fullName =
    user.firstName || user.lastName
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : user.username;

  const presenceLabel = user.isOnline
    ? "online"
    : user.lastSeen
      ? `last seen ${formatDistanceToNow(new Date(user.lastSeen), {
          addSuffix: true,
        })}`
      : null;

  return (
    <DialogShell title="Contact info" onClose={close}>
      <div className="px-6 pt-6 pb-5 flex flex-col items-center gap-2 border-b border-chat-border">
        {user.imageUrl ? (
          <img
            src={user.imageUrl}
            alt={fullName}
            className="w-28 h-28 rounded-full object-cover"
          />
        ) : (
          <div className="w-28 h-28 rounded-full bg-primary-600 flex items-center justify-center text-white text-3xl font-semibold">
            {getInitials(fullName)}
          </div>
        )}
        <p className="text-xl font-semibold text-chat-text-primary text-center">
          {fullName}
        </p>
        {presenceLabel && (
          <p className="text-xs text-chat-text-muted flex items-center gap-1.5">
            <Circle
              className={`w-2 h-2 ${
                user.isOnline ? "fill-emerald-500 text-emerald-500" : "fill-chat-text-muted text-chat-text-muted"
              }`}
            />
            {presenceLabel}
          </p>
        )}
      </div>

      <div className="px-6 py-4 space-y-3">
        {user.status?.trim() && (
          <Field label="About">
            <p className="text-sm text-chat-text-primary whitespace-pre-wrap">
              {user.status}
            </p>
          </Field>
        )}

        <Field label="Username">
          <p className="text-sm text-chat-text-primary flex items-center gap-1.5">
            <AtSign className="w-3.5 h-3.5 text-chat-text-muted" />
            {user.username}
          </p>
        </Field>

        {user.email && (
          <Field label="Email">
            <p className="text-sm text-chat-text-primary flex items-center gap-1.5 break-all">
              <Mail className="w-3.5 h-3.5 text-chat-text-muted flex-shrink-0" />
              {user.email}
            </p>
          </Field>
        )}
      </div>
    </DialogShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-chat-text-muted font-medium mb-1">
        {label}
      </p>
      {children}
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
