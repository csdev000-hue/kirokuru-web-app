/** Product dates use the Japan calendar, independently of the browser/server timezone. */
export function todayInJapan(now = new Date()) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function isOverdue(dueDate: string | null, status: string, today = todayInJapan()) { return !!dueDate && dueDate < today && status !== "done"; }
