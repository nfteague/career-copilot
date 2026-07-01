// Map raw SDK/network failures to messages a non-technical user can act on.
// Both the Anthropic and OpenAI SDKs throw APIError subclasses carrying an
// HTTP `status`; anything else is treated as a connectivity problem.
export function friendlyError(e: unknown): string {
  const status: number | undefined =
    (e as { status?: number })?.status ?? (e as { response?: { status?: number } })?.response?.status;
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();

  if (status === 401 || status === 403) {
    return 'Your API key was rejected by the provider. Check it in Settings.';
  }
  if (status === 402 || lower.includes('billing') || lower.includes('credit balance')) {
    return 'Your provider account has a billing problem (likely out of credits). Check billing on the provider’s site.';
  }
  if (status === 429) {
    return 'The provider rate-limited the request (or your account is out of quota). Wait a moment and try again.';
  }
  if (status === 404 && (lower.includes('model') || lower.includes('not_found'))) {
    return 'The selected model isn’t available on your account. Pick a different model in Settings.';
  }
  if (status !== undefined && status >= 500) {
    return 'The provider is having trouble right now. Try again in a moment.';
  }
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('connection')) {
    return 'Couldn’t reach the provider — check your internet connection and try again.';
  }
  return raw || 'Something went wrong.';
}
