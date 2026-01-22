"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Send, Trash2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";

interface VoiceRecorderProps {
  conversationId: Id<"conversations">;
  onCancel: () => void;
  onSend: () => void;
}

export function VoiceRecorder({
  conversationId,
  onCancel,
  onSend,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(true);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isSending, setIsSending] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const sendMessage = useMutation(api.messages.sendMessage);

  useEffect(() => {
    startRecording();
    return () => {
      stopRecording();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);

      intervalRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (error) {
      console.error("Failed to start recording:", error);
      onCancel();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  };

  const handleSend = async () => {
    if (!audioBlob) return;

    setIsSending(true);
    try {
      const uploadUrl = await generateUploadUrl();

      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": audioBlob.type },
        body: audioBlob,
      });

      const { storageId } = await result.json();

      await sendMessage({
        conversationId,
        type: "voice",
        fileStorageId: storageId,
        fileName: "voice-message.webm",
        fileSize: audioBlob.size,
        fileMimeType: audioBlob.type,
        voiceDuration: duration,
      });

      onSend();
    } catch (error) {
      console.error("Failed to send voice message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = () => {
    stopRecording();
    onCancel();
  };

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleCancel}
        className="p-2 hover:bg-chat-hover rounded-full transition-colors"
      >
        <Trash2 className="w-6 h-6 text-red-400" />
      </button>

      <div className="flex-1 flex items-center gap-3">
        <div
          className={`w-3 h-3 bg-red-500 rounded-full ${isRecording ? "recording-indicator" : ""}`}
        />
        <span className="text-chat-text-primary font-medium">
          {formatDuration(duration)}
        </span>
        {isRecording && (
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
      </div>

      {isRecording ? (
        <button
          onClick={stopRecording}
          className="p-3 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
        >
          <div className="w-4 h-4 bg-white rounded-sm" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={isSending}
          className="p-3 bg-primary-600 hover:bg-primary-700 rounded-full transition-colors disabled:opacity-50"
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      )}
    </div>
  );
}