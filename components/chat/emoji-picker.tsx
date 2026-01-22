"use client";

import { useEffect, useRef } from "react";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  quickPick?: boolean;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const EMOJI_CATEGORIES: Record<string, string[]> = {
  Smileys: [
    "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂",
    "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋",
    "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐",
    "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😔",
    "😪", "🤤", "😴", "😷",
  ],
  Gestures: [
    "👍", "👎", "👊", "✊", "🤛", "🤜", "🤞", "✌️", "🤟", "🤘",
    "👌", "🤌", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐",
    "🖖", "👋", "🤙", "💪", "🙏", "🤝", "👏", "🙌",
  ],
  Hearts: [
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
    "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝",
  ],
  Objects: [
    "🎉", "🎊", "🎁", "🎈", "✨", "🌟", "⭐", "💫", "🔥", "💥",
    "💯", "🏆", "🎯", "🎮", "🎲", "🎸", "🎤", "🎧",
  ],
};

export function EmojiPicker({ onSelect, onClose, quickPick }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  if (quickPick) {
    return (
      <div
        ref={ref}
        className="flex items-center gap-1 p-2 bg-chat-header rounded-full shadow-xl border border-chat-border animate-scale-in"
      >
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className="w-8 h-8 flex items-center justify-center hover:bg-chat-hover rounded-full transition-colors text-lg"
          >
            {emoji}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="w-72 max-h-80 bg-chat-header rounded-lg shadow-xl border border-chat-border overflow-hidden animate-scale-in"
    >
      <div className="p-2 border-b border-chat-border">
        <div className="flex gap-1">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSelect(emoji)}
              className="w-8 h-8 flex items-center justify-center hover:bg-chat-hover rounded transition-colors text-lg"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto p-2">
        {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
          <div key={category} className="mb-3">
            <p className="text-xs text-chat-text-muted mb-2 px-1">{category}</p>
            <div className="flex flex-wrap gap-1">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onSelect(emoji)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-chat-hover rounded transition-colors text-lg"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}