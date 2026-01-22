"use client";

import { useState, useEffect } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { Sidebar } from "@/components/chat/sidebar";
import { ChatView } from "@/components/chat/chat-view";
import { EmptyState } from "@/components/chat/empty-state";
import { useOnlineStatus } from "@/hooks/use-online-status";

export default function ChatPage() {
  const [selectedConversationId, setSelectedConversationId] =
    useState<Id<"conversations"> | null>(null);
  const [isMobileView, setIsMobileView] = useState(false);

  // Track online status
  useOnlineStatus();

  // Handle responsive view
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const showSidebar = !isMobileView || !selectedConversationId;
  const showChat = !isMobileView || selectedConversationId;

  return (
    <div className="flex h-screen bg-chat-bg overflow-hidden">
      {/* Sidebar */}
      {showSidebar && (
        <div
          className={`${
            isMobileView ? "w-full" : "w-[400px] min-w-[300px]"
          } border-r border-chat-border flex-shrink-0`}
        >
          <Sidebar
            selectedConversationId={selectedConversationId}
            onSelectConversation={setSelectedConversationId}
          />
        </div>
      )}

      {/* Chat View */}
      {showChat && (
        <div className="flex-1 flex flex-col min-w-0">
          {selectedConversationId ? (
            <ChatView
              conversationId={selectedConversationId}
              onBack={
                isMobileView
                  ? () => setSelectedConversationId(null)
                  : undefined
              }
            />
          ) : (
            <EmptyState />
          )}
        </div>
      )}
    </div>
  );
}