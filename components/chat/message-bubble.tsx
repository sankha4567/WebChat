"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { FunctionReturnType } from "convex/server";
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
  Mic,
} from "lucide-react";
import { cn, formatFileSize, formatDuration } from "@/lib/utils";
import { EmojiPicker } from "./emoji-picker";
import { ReplyPreviewBody } from "./reply-preview-body";

type Message = NonNullable<
  FunctionReturnType<typeof api.messages.getMessages>[number]
>;
type Reaction = Message["reactions"][number];

interface MessageBubbleProps {
  message: Message;
  conversationId: Id<"conversations">;
  isGroup: boolean;
  isGroupAdmin: boolean;
  onReply: () => void;
}

export function MessageBubble({
  message,
  isGroup,
  isGroupAdmin,
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
          {formatSystemMessage(message)}
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
                setEditContent(message.content ?? "");
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
            <ReplyPreviewBody
              message={message.replyTo}
              senderLabel={message.replyTo.sender?.username || "Unknown"}
              size="sm"
            />
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
          {/* Sender name — group chats only; DMs already identify the
              other party in the chat header. */}
          {isGroup && !message.isOwn && message.sender && (
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
                  messageId={message._id}
                  url={message.fileUrl}
                  duration={message.voiceDuration || 0}
                  isOwn={message.isOwn}
                  playedByRecipient={message.playedByRecipient}
                  playedByMe={message.playedByMe}
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
            {message.isOwn && <ReadTicks message={message} />}
          </div>
        </div>

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.reactions.map((reaction: Reaction) => (
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
          {isGroup && isGroupAdmin ? (
            // Admins of a group can also remove other members' messages
            // for everyone — submenu mirrors the own-message delete UI.
            <div className="relative">
              <button
                onClick={() => setShowDeleteMenu(!showDeleteMenu)}
                className="p-1.5 hover:bg-chat-hover rounded-full"
              >
                <Trash2 className="w-4 h-4 text-chat-text-muted" />
              </button>
              {showDeleteMenu && (
                <div className="absolute left-0 top-full mt-1 py-1 bg-chat-header rounded-lg shadow-xl border border-chat-border z-10 min-w-[180px]">
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
          ) : (
            <button
              onClick={handleDeleteForMe}
              className="p-1.5 hover:bg-chat-hover rounded-full"
            >
              <Trash2 className="w-4 h-4 text-chat-text-muted" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Renders system messages with viewer-relative pronouns:
//   actor === current user → "You"
//   target === current user → "you"
// Falls back to the pre-formatted content string for messages predating
// the structured-system-message migration (no systemAction set).
function formatSystemMessage(m: Message): string {
  if (!m.systemAction) return m.content ?? "";

  const actor = m.isOwn
    ? "You"
    : m.sender
      ? m.sender.firstName && m.sender.lastName
        ? `${m.sender.firstName} ${m.sender.lastName}`
        : m.sender.firstName || m.sender.username
      : "Someone";

  const target = m.systemTargetIsMe ? "you" : (m.systemTargetName ?? "user");

  switch (m.systemAction) {
    case "group_created":
      return `${actor} created the group "${m.systemGroupName ?? ""}"`;
    case "member_added":
      return `${actor} added ${target}`;
    case "member_removed":
      return `${actor} removed ${target}`;
    case "member_left":
      return `${actor} left the group`;
  }
}

function ReadTicks({ message }: { message: Message }) {
  // Hide ticks until the server has had a chance to compute recipient state.
  if (!message.isOwn) return null;

  if (message.readByAll) {
    return <CheckCheck className="w-4 h-4 text-sky-400" aria-label="Read" />;
  }
  if (message.anyRecipientOnline) {
    return (
      <CheckCheck
        className="w-4 h-4 text-chat-text-muted"
        aria-label="Delivered"
      />
    );
  }
  return <Check className="w-4 h-4 text-chat-text-muted" aria-label="Sent" />;
}

const WAVEFORM_BARS = 36;

// Stable, deterministic waveform shape based on the audio URL so a given
// voice message always renders identically. Replace with real PCM-derived
// bars when we add Web Audio decoding.
function generateWaveform(seed: string | undefined, count: number): number[] {
  let h = 2166136261;
  if (seed) {
    for (let i = 0; i < seed.length; i++) {
      h = (h ^ seed.charCodeAt(i)) >>> 0;
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    // 25% – 95% bar height — looks like a real waveform without being noisy.
    out.push(25 + ((h >>> 16) % 71));
  }
  return out;
}

const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;

// MediaRecorder-produced webm files don't include a duration in their
// metadata, so audio.duration starts as Infinity. The standard fix is to
// seek to a huge time, which forces the browser to scan to the end and
// emit a durationchange event with the real value.
function probeDuration(a: HTMLAudioElement, onResolved: (d: number) => void) {
  if (Number.isFinite(a.duration) && a.duration > 0) {
    onResolved(a.duration);
    return;
  }
  const handleChange = () => {
    if (Number.isFinite(a.duration) && a.duration > 0) {
      a.removeEventListener("durationchange", handleChange);
      try {
        a.currentTime = 0;
      } catch {
        // Some browsers throw if seek happens before metadata; safe to ignore.
      }
      onResolved(a.duration);
    }
  };
  a.addEventListener("durationchange", handleChange);
  try {
    a.currentTime = 1e9;
  } catch {
    // Safari may need metadata first — durationchange will still fire later.
  }
}

function VoicePlayer({
  messageId,
  url,
  duration,
  isOwn,
  playedByRecipient,
  playedByMe,
}: {
  messageId: Id<"messages">;
  url?: string;
  duration: number;
  isOwn: boolean;
  playedByRecipient: boolean;
  playedByMe: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState<number | null>(null);
  const [speedIndex, setSpeedIndex] = useState(0);
  // Optimistic local flag set the moment the user clicks play, so the dot
  // turns blue immediately rather than waiting for the markVoiceAsPlayed
  // mutation to round-trip and the getMessages query to refresh.
  const [locallyPlayed, setLocallyPlayed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reportedPlayRef = useRef(false);
  // True only while the user has actively triggered playback. Blocks
  // currentTime updates from probe-seeks (e.g. the duration-probe seeks
  // to 1e9 and back, which would otherwise look like playback to the UI).
  const playingRef = useRef(false);
  const markVoiceAsPlayed = useMutation(api.messages.markVoiceAsPlayed);
  const bars = useMemo(() => generateWaveform(url, WAVEFORM_BARS), [url]);
  const speed = PLAYBACK_SPEEDS[speedIndex];

  // Authoritative duration: prefer the audio element's value (more accurate
  // than the recorder's integer-second timer, which can be 0 for short
  // messages and is missing entirely on legacy rows).
  const effectiveDuration =
    resolvedDuration && resolvedDuration > 0
      ? resolvedDuration
      : duration > 0
        ? duration
        : 0;

  // Initialize on mount with preload="metadata" so the bubble shows the real
  // audio length before the user presses play. Same element is reused for
  // playback so we don't double-fetch.
  useEffect(() => {
    if (!url) return;
    const a = new Audio(url);
    a.preload = "metadata";

    const onTimeUpdate = () => {
      // Ignore time updates from internal seeks (duration probe). Only
      // reflect them in the UI when the user is actually playing back.
      if (!playingRef.current) return;
      setCurrentTime(a.currentTime);
    };
    const onEnded = () => {
      playingRef.current = false;
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onLoaded = () => probeDuration(a, setResolvedDuration);

    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("ended", onEnded);
    a.addEventListener("loadedmetadata", onLoaded);
    if (a.readyState >= 1) probeDuration(a, setResolvedDuration);

    audioRef.current = a;
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("loadedmetadata", onLoaded);
      audioRef.current = null;
    };
  }, [url]);

  // Keep playbackRate in sync when speed changes mid-message.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const handlePlayPause = () => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      playingRef.current = false;
      a.pause();
      setIsPlaying(false);
    } else {
      playingRef.current = true;
      void a.play();
      setIsPlaying(true);
      // Record a "heard" receipt the first time a recipient plays the voice.
      // Server-side mutation guards against the sender flipping their own
      // mic, but skip the round-trip entirely when isOwn.
      if (!isOwn && !reportedPlayRef.current) {
        reportedPlayRef.current = true;
        setLocallyPlayed(true);
        void markVoiceAsPlayed({ messageId });
      }
    }
  };

  const cycleSpeed = () => {
    setSpeedIndex((i) => (i + 1) % PLAYBACK_SPEEDS.length);
  };

  const progress =
    effectiveDuration > 0 ? Math.min(currentTime / effectiveDuration, 1) : 0;
  const playedBars = Math.floor(progress * bars.length);
  const playheadX = `${progress * 100}%`;
  const hasStarted = currentTime > 0 || isPlaying;

  return (
    <div className="flex items-center gap-3 min-w-[280px] max-w-[340px] py-1">
      <button
        onClick={handlePlayPause}
        className="w-10 h-10 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 text-white" />
        ) : (
          <Play className="w-5 h-5 text-white ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="relative h-7 flex items-center">
          <div className="flex items-center gap-[2px] w-full h-full">
            {bars.map((heightPct, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-colors",
                  // Played bars stay clearly visible against any bubble color
                  // (own = green, incoming = dark gray) — white at high alpha
                  // contrasts on both. Unplayed bars are dimmer but visible.
                  i < playedBars ? "bg-white/90" : "bg-white/30",
                )}
                style={{ height: `${heightPct}%` }}
              />
            ))}
          </div>
          {/* Playhead color reflects "has this been heard":
              - Sender side: blue once recipient(s) played the message.
              - Recipient side: blue once the user has played it themselves
                (server-confirmed via playedByMe, with locallyPlayed for
                immediate feedback before the mutation round-trips).
              Gray in all other cases. */}
          <div
            className={cn(
              "absolute w-3 h-3 rounded-full shadow-md ring-2 pointer-events-none transition-[left,background-color] duration-100",
              (isOwn
                ? playedByRecipient
                : playedByMe || locallyPlayed)
                ? "bg-sky-400 ring-sky-400/30"
                : "bg-white/60 ring-white/20",
            )}
            style={{
              left: playheadX,
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <Mic
            className={cn(
              "w-3 h-3 flex-shrink-0 transition-colors",
              // Sender's bubble: mic turns sky-blue once every recipient
              // has played the voice — the WhatsApp "heard" indicator.
              isOwn && playedByRecipient
                ? "text-sky-400"
                : "text-chat-text-muted",
            )}
          />
          <span className="text-xs text-chat-text-muted tabular-nums">
            {formatDuration(hasStarted ? currentTime : effectiveDuration)}
          </span>
        </div>
      </div>

      <button
        onClick={cycleSpeed}
        className={cn(
          "px-2.5 py-1 rounded-full text-[11px] font-semibold tabular-nums transition-colors flex-shrink-0",
          // Highlight when not at 1× so users notice an active speed boost.
          speed === 1
            ? "bg-black/30 text-white/80 hover:bg-black/40"
            : "bg-sky-500/30 text-sky-200 hover:bg-sky-500/40",
        )}
        aria-label={`Playback speed ${speed}x`}
      >
        {speed}×
      </button>
    </div>
  );
}