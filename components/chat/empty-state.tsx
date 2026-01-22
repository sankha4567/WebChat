"use client";

import { MessageSquare, Lock } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-chat-bg chat-bg-pattern">
      <div className="text-center max-w-md px-8">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-chat-input flex items-center justify-center">
          <MessageSquare className="w-12 h-12 text-chat-text-muted" />
        </div>
        <h2 className="text-3xl font-light text-chat-text-primary mb-4">
          Welcome to Chat
        </h2>
        <p className="text-chat-text-secondary mb-8">
          Send and receive messages in real-time. Start a conversation by
          selecting a chat from the sidebar or searching for a user.
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-chat-text-muted">
          <Lock className="w-4 h-4" />
          <span>End-to-end encrypted</span>
        </div>
      </div>
    </div>
  );
}