export function readGenerationQuota(data, receivedAt = Date.now()) {
  const reset = Date.parse(data?.resets_at), server = Date.parse(data?.server_now);
  if (!Number.isInteger(data?.limit) || data.limit <= 0 || !Number.isInteger(data?.remaining)
    || data.remaining < 0 || data.remaining > data.limit || !Number.isFinite(reset)
    || !Number.isFinite(server) || reset <= server) throw Error('Invalid allowance');
  return {...data, deadline: receivedAt + reset - server};
}

export function quotaCountdown(deadline, now = Date.now()) {
  const minutes = Math.max(0, Math.ceil((deadline - now) / 60000));
  if (!minutes) return 'Checking reset…';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
