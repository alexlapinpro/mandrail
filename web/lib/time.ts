export function ageText(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} h`;
}

export function countdownText(seconds: number): string {
  if (seconds <= 0) return "now";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
  return `${Math.floor(seconds / 86_400)} d ${Math.floor((seconds % 86_400) / 3600)} h`;
}
