export function digestSkipReason(input: {
  force?: boolean;
  enabled: boolean;
  localTime: string;
  nowTime: string;
  localDate: string;
  lastDigestSentOn: string | null;
}): string | null {
  // Manual runs may override the schedule, never the daily delivery guard.
  if (input.lastDigestSentOn === input.localDate) return `Digest already sent on ${input.localDate}.`;
  if (!input.force && !input.enabled) return "Daily digest automation is disabled in /ops.";
  if (!input.force && input.nowTime < input.localTime) {
    return `Current Luxembourg time ${input.nowTime} is still before scheduled digest time ${input.localTime}.`;
  }
  return null;
}
