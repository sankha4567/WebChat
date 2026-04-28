"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { Camera, Loader2, Pencil, X } from "lucide-react";
import { getInitials } from "@/lib/utils";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_MAX = 140;

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user: clerkUser } = useUser();
  const me = useQuery(api.users.getCurrentUser);
  const updateProfile = useMutation(api.users.updateProfile);

  const [editingName, setEditingName] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState("");
  const [lastNameDraft, setLastNameDraft] = useState("");

  const [editingStatus, setEditingStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");

  const [savingName, setSavingName] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Sync drafts from server state whenever the dialog (re)opens.
  useEffect(() => {
    if (!open) return;
    setFirstNameDraft(clerkUser?.firstName ?? me?.firstName ?? "");
    setLastNameDraft(clerkUser?.lastName ?? me?.lastName ?? "");
    setStatusDraft(me?.status ?? "");
    setEditingName(false);
    setEditingStatus(false);
    setError(null);
  }, [open, clerkUser?.firstName, clerkUser?.lastName, me?.firstName, me?.lastName, me?.status]);

  if (!open) return null;

  const displayName =
    clerkUser?.fullName ||
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    me?.firstName ||
    me?.username ||
    clerkUser?.username ||
    "You";
  const avatar = clerkUser?.imageUrl || me?.imageUrl;

  const handleSaveName = async () => {
    if (!clerkUser) return;
    setSavingName(true);
    setError(null);
    try {
      await clerkUser.update({
        firstName: firstNameDraft.trim() || undefined,
        lastName: lastNameDraft.trim() || undefined,
      });
      // Convex users.firstName/lastName updates via the Clerk webhook;
      // there's a brief delay before this UI reflects it on getCurrentUser.
      setEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update name");
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveStatus = async () => {
    setSavingStatus(true);
    setError(null);
    try {
      await updateProfile({ status: statusDraft });
      setEditingStatus(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSavingStatus(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !clerkUser) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5 MB or smaller");
      return;
    }
    setSavingPhoto(true);
    setError(null);
    try {
      // Clerk owns the avatar; the Convex webhook will mirror imageUrl
      // shortly after this resolves.
      await clerkUser.setProfileImage({ file });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update photo");
    } finally {
      setSavingPhoto(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20">
      <div className="bg-chat-sidebar w-full max-w-md rounded-lg shadow-xl animate-scale-in overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-chat-border bg-chat-header">
          <h2 className="text-lg font-semibold text-chat-text-primary">
            Profile
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 hover:bg-chat-hover rounded"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-chat-text-muted" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-3 border-b border-chat-border">
          <div className="relative">
            {avatar ? (
              <img
                src={avatar}
                alt={displayName}
                className="w-28 h-28 rounded-full object-cover"
              />
            ) : (
              <div className="w-28 h-28 rounded-full bg-primary-600 flex items-center justify-center text-white text-3xl font-semibold">
                {getInitials(displayName)}
              </div>
            )}
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={savingPhoto}
              className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-primary-600 hover:bg-primary-700 flex items-center justify-center shadow-md border-2 border-chat-sidebar disabled:opacity-50"
              aria-label="Change photo"
            >
              {savingPhoto ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Camera className="w-4 h-4 text-white" />
              )}
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>
          <div className="text-center">
            <p className="text-xl font-semibold text-chat-text-primary">
              {displayName}
            </p>
            {me?.username && (
              <p className="text-sm text-chat-text-muted">@{me.username}</p>
            )}
          </div>
          <p className="text-xs text-chat-text-muted text-center">
            Email and password are managed in your account settings.
          </p>
        </div>

        {/* Name section */}
        <div className="px-6 py-4 border-b border-chat-border">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-chat-text-secondary">
              Name
            </label>
            {!editingName && (
              <button
                onClick={() => setEditingName(true)}
                className="p-1 hover:bg-chat-hover rounded"
                aria-label="Edit name"
              >
                <Pencil className="w-4 h-4 text-chat-text-muted" />
              </button>
            )}
          </div>

          {editingName ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={firstNameDraft}
                  onChange={(e) => setFirstNameDraft(e.target.value)}
                  placeholder="First name"
                  className="bg-chat-input text-chat-text-primary placeholder:text-chat-text-muted rounded-lg px-3 py-2 focus:outline-none"
                  autoFocus
                />
                <input
                  type="text"
                  value={lastNameDraft}
                  onChange={(e) => setLastNameDraft(e.target.value)}
                  placeholder="Last name"
                  className="bg-chat-input text-chat-text-primary placeholder:text-chat-text-muted rounded-lg px-3 py-2 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 text-xs">
                <button
                  onClick={() => {
                    setFirstNameDraft(clerkUser?.firstName ?? "");
                    setLastNameDraft(clerkUser?.lastName ?? "");
                    setEditingName(false);
                  }}
                  className="px-3 py-1 text-chat-text-secondary hover:bg-chat-hover rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1"
                >
                  {savingName && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-chat-text-primary">
              {[clerkUser?.firstName, clerkUser?.lastName]
                .filter(Boolean)
                .join(" ") || (
                <span className="text-chat-text-muted italic">No name set</span>
              )}
            </p>
          )}
        </div>

        {/* Status section */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-chat-text-secondary">
              Status
            </label>
            {!editingStatus && (
              <button
                onClick={() => setEditingStatus(true)}
                className="p-1 hover:bg-chat-hover rounded"
                aria-label="Edit status"
              >
                <Pencil className="w-4 h-4 text-chat-text-muted" />
              </button>
            )}
          </div>

          {editingStatus ? (
            <div className="space-y-2">
              <textarea
                value={statusDraft}
                onChange={(e) =>
                  setStatusDraft(e.target.value.slice(0, STATUS_MAX))
                }
                placeholder="What's on your mind?"
                rows={3}
                className="w-full bg-chat-input text-chat-text-primary placeholder:text-chat-text-muted rounded-lg px-3 py-2 focus:outline-none resize-none"
                autoFocus
              />
              <div className="flex items-center justify-between text-xs text-chat-text-muted">
                <span>{STATUS_MAX - statusDraft.length} characters left</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setStatusDraft(me?.status ?? "");
                      setEditingStatus(false);
                    }}
                    className="px-3 py-1 text-chat-text-secondary hover:bg-chat-hover rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveStatus}
                    disabled={savingStatus}
                    className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {savingStatus && <Loader2 className="w-3 h-3 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-chat-text-primary whitespace-pre-wrap">
              {me?.status?.trim() || (
                <span className="text-chat-text-muted italic">
                  No status set
                </span>
              )}
            </p>
          )}
        </div>

        {error && (
          <div className="px-6 pb-4 -mt-2 text-xs text-red-400">{error}</div>
        )}
      </div>
    </div>
  );
}
