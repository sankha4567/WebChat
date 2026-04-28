import { type ClassValue, clsx } from "clsx";
import { format, isToday, isYesterday } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// WhatsApp-style compact timestamp for the conversation list:
//   today      → 5:27 PM
//   yesterday  → Yesterday
//   <7d ago    → weekday name (Tuesday)
//   older      → MM/DD/YY
export function formatChatTimestamp(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  if (Date.now() - d.getTime() < SEVEN_DAYS_MS) return format(d, "EEEE");
  return format(d, "MM/dd/yy");
}

// "last seen ..." line in the chat header.
export function formatLastSeen(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  if (isToday(d)) return `today at ${format(d, "h:mm a")}`;
  if (isYesterday(d)) return `yesterday at ${format(d, "h:mm a")}`;
  return `${format(d, "MMM d")} at ${format(d, "h:mm a")}`;
}