export type EodEntry = {
  userId: string;
  date: string; // YYYY-MM-DD, UTC calendar day
  content: string;
  createdAt: number;
  updatedAt: number;
};

export function todayDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
