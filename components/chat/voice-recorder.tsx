"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Loader2, Play, Send, Trash2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";

interface VoiceRecorderProps {
  conversationId: Id<"conversations">;
  onCancel: () => void;
  onSend: () => void;
}

type RecState = "starting" | "recording" | "paused" | "sending";

// Pick a MIME type the browser actually supports (Safari can't do webm).
function pickMimeType(): string | undefined {
  const candidates = [
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return undefined;
}

export function VoiceRecorder({
  conversationId,
  onCancel,
  onSend,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecState>("starting");
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Set when the user clicks Send: onstop will pick this up and finalize.
  const finalizeOnStopRef = useRef(false);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const sendMessage = useMutation(api.messages.sendMessage);

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    intervalRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          stopTimer();
          releaseStream();
          if (!finalizeOnStopRef.current) return;
          await finalize(recorder.mimeType || mimeType || "audio/webm");
        };

        recorder.start();
        setState("recording");
        startTimer();
      } catch {
        onCancel();
      }
    })();

    return () => {
      cancelled = true;
      stopTimer();
      const r = mediaRecorderRef.current;
      if (r && r.state !== "inactive") {
        finalizeOnStopRef.current = false;
        try {
          r.stop();
        } catch {
          // Already stopped.
        }
      }
      releaseStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finalize = async (mime: string) => {
    setState("sending");
    try {
      const blob = new Blob(chunksRef.current, { type: mime });
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      const { storageId } = await result.json();
      await sendMessage({
        conversationId,
        type: "voice",
        fileStorageId: storageId,
        fileName: `voice-message.${mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm"}`,
        fileSize: blob.size,
        fileMimeType: blob.type,
        voiceDuration: duration,
      });
      onSend();
    } catch {
      onCancel();
    }
  };

  const togglePause = () => {
    const r = mediaRecorderRef.current;
    if (!r) return;
    if (r.state === "recording") {
      r.pause();
      stopTimer();
      setState("paused");
    } else if (r.state === "paused") {
      r.resume();
      startTimer();
      setState("recording");
    }
  };

  const handleSend = () => {
    const r = mediaRecorderRef.current;
    if (!r) return;
    finalizeOnStopRef.current = true;
    if (r.state === "inactive") {
      // Already stopped (shouldn't happen here, but guard anyway).
      void finalize(r.mimeType || "audio/webm");
      return;
    }
    try {
      r.stop();
    } catch {
      // ignore
    }
  };

  const handleCancel = () => {
    const r = mediaRecorderRef.current;
    finalizeOnStopRef.current = false;
    if (r && r.state !== "inactive") {
      try {
        r.stop();
      } catch {
        // ignore
      }
    }
    onCancel();
  };

  const isPaused = state === "paused";
  const isSending = state === "sending";

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleCancel}
        disabled={isSending}
        className="p-2 hover:bg-chat-hover rounded-full transition-colors disabled:opacity-50"
        aria-label="Cancel recording"
      >
        <Trash2 className="w-6 h-6 text-red-400" />
      </button>

      <div className="flex-1 flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${
            isPaused ? "bg-chat-text-muted" : "bg-red-500 recording-indicator"
          }`}
        />
        <span className="text-chat-text-primary font-medium tabular-nums">
          {formatDuration(duration)}
        </span>
        {!isPaused && !isSending && (
          <div className="flex-1 flex items-center gap-1">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-primary-500 rounded-full animate-pulse"
                style={{
                  height: `${Math.random() * 20 + 10}px`,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
        )}
        {isPaused && (
          <span className="text-xs text-chat-text-muted">Paused</span>
        )}
      </div>

      <button
        onClick={togglePause}
        disabled={isSending}
        className="p-3 bg-chat-input hover:bg-chat-hover rounded-full transition-colors disabled:opacity-50"
        aria-label={isPaused ? "Resume recording" : "Pause recording"}
      >
        {isPaused ? (
          <Play className="w-5 h-5 text-primary-400 ml-0.5" />
        ) : (
          <div className="w-4 h-4 bg-chat-text-primary rounded-sm" />
        )}
      </button>

      <button
        onClick={handleSend}
        disabled={isSending}
        className="p-3 bg-primary-600 hover:bg-primary-700 rounded-full transition-colors disabled:opacity-50"
        aria-label="Send voice message"
      >
        {isSending ? (
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        ) : (
          <Send className="w-5 h-5 text-white" />
        )}
      </button>
    </div>
  );
}
