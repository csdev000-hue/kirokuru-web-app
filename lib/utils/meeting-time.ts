export function transcriptTimestamp(seconds: number) {
 const value = Math.floor(seconds);
 return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60].map((n) => String(n).padStart(2, "0")).join(":");
}
export const meetingTime = (value: Date | string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
