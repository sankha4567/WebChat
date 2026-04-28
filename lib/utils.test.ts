import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cn,
  formatChatTimestamp,
  formatDuration,
  formatFileSize,
  formatLastSeen,
  getInitials,
} from "./utils";

describe("cn", () => {
  it("merges class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("dedupes Tailwind utility classes — last one wins on conflict", () => {
    // tailwind-merge resolves p-2 vs p-4 → p-4
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("filters out falsy values from clsx-style inputs", () => {
    expect(cn("foo", false && "bar", null, undefined, "baz")).toBe("foo baz");
  });

  it("supports conditional object syntax", () => {
    expect(cn("foo", { bar: true, baz: false })).toBe("foo bar");
  });
});

describe("formatFileSize", () => {
  it("returns '0 Bytes' for 0", () => {
    expect(formatFileSize(0)).toBe("0 Bytes");
  });

  it("formats 1024 as 1 KB", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
  });

  it("formats 1048576 as 1 MB", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1 MB");
  });

  it("formats 1073741824 as 1 GB", () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
  });

  it("rounds to 2 decimals", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });
});

describe("formatDuration", () => {
  it("formats 0 seconds as '0:00'", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("formats 65 seconds as '1:05'", () => {
    expect(formatDuration(65)).toBe("1:05");
  });

  it("formats 600 seconds as '10:00'", () => {
    expect(formatDuration(600)).toBe("10:00");
  });

  it("pads single-digit seconds with a leading zero", () => {
    expect(formatDuration(61)).toBe("1:01");
  });

  it("floors fractional seconds", () => {
    expect(formatDuration(59.9)).toBe("0:59");
  });
});

describe("getInitials", () => {
  it("returns first letter of first and last name", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("returns single uppercase letter for single-name input", () => {
    expect(getInitials("Madonna")).toBe("M");
  });

  it("clamps to two letters even with three name parts", () => {
    expect(getInitials("John Michael Doe")).toBe("JM");
  });

  it("uppercases lowercase input", () => {
    expect(getInitials("alice bob")).toBe("AB");
  });
});

describe("formatChatTimestamp", () => {
  // Anchor "now" at a known instant so the today/yesterday/weekday/older
  // branches are deterministic across test runs and timezones.
  beforeEach(() => {
    vi.useFakeTimers();
    // 2025-01-15 14:30:00 local time
    vi.setSystemTime(new Date(2025, 0, 15, 14, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders today with h:mm a", () => {
    const today = new Date(2025, 0, 15, 9, 5, 0);
    // Expect like "9:05 AM"
    expect(formatChatTimestamp(today)).toBe("9:05 AM");
  });

  it("renders yesterday as 'Yesterday'", () => {
    const yesterday = new Date(2025, 0, 14, 23, 30, 0);
    expect(formatChatTimestamp(yesterday)).toBe("Yesterday");
  });

  it("renders within the last 7 days as the weekday name", () => {
    // 3 days before "now" (Jan 15 is Wednesday → Jan 12 is Sunday)
    const threeDaysAgo = new Date(2025, 0, 12, 12, 0, 0);
    expect(formatChatTimestamp(threeDaysAgo)).toBe("Sunday");
  });

  it("renders older dates as MM/dd/yy", () => {
    const thirtyDaysAgo = new Date(2024, 11, 16, 12, 0, 0);
    expect(formatChatTimestamp(thirtyDaysAgo)).toBe("12/16/24");
  });

  it("accepts a numeric timestamp", () => {
    const today = new Date(2025, 0, 15, 9, 5, 0).getTime();
    expect(formatChatTimestamp(today)).toBe("9:05 AM");
  });
});

describe("formatLastSeen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 14, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefixes today's time with 'today at'", () => {
    const today = new Date(2025, 0, 15, 9, 5, 0);
    expect(formatLastSeen(today)).toBe("today at 9:05 AM");
  });

  it("prefixes yesterday's time with 'yesterday at'", () => {
    const yesterday = new Date(2025, 0, 14, 18, 0, 0);
    expect(formatLastSeen(yesterday)).toBe("yesterday at 6:00 PM");
  });

  it("renders older dates as 'MMM d at h:mm a'", () => {
    const older = new Date(2024, 11, 16, 12, 0, 0);
    expect(formatLastSeen(older)).toBe("Dec 16 at 12:00 PM");
  });

  it("accepts a numeric timestamp", () => {
    const today = new Date(2025, 0, 15, 9, 5, 0).getTime();
    expect(formatLastSeen(today)).toBe("today at 9:05 AM");
  });
});
