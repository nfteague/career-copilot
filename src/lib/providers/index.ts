import { Settings, activeCreds } from '../types';
import { LLMProvider } from './shared';
import { friendlyError } from '../errors';

export type { LLMProvider, GenerateArgs } from './shared';

// Build the provider for the currently selected option in settings. The SDKs
// are dynamic imports so the panel shell loads without either vendor bundle;
// only the selected provider's chunk is ever fetched, on first use.
export async function getProvider(settings: Settings): Promise<LLMProvider> {
  const { apiKey, model } = activeCreds(settings);
  if (settings.provider === 'openai') {
    const { OpenAIProvider } = await import('./openai');
    return new OpenAIProvider(apiKey, model);
  }
  const { AnthropicProvider } = await import('./anthropic');
  return new AnthropicProvider(apiKey, model);
}

// Verify the active key with a free models-list call so the user learns about
// a bad key at save time, not on their first generation. Returns null when the
// key works, otherwise a user-facing error message.
export async function checkCredentials(settings: Settings): Promise<string | null> {
  const { apiKey } = activeCreds(settings);
  try {
    if (settings.provider === 'openai') {
      const { default: OpenAI } = await import('openai');
      await new OpenAI({ apiKey, dangerouslyAllowBrowser: true }).models.list();
    } else {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      await new Anthropic({ apiKey, dangerouslyAllowBrowser: true }).models.list({ limit: 1 });
    }
    return null;
  } catch (e) {
    return friendlyError(e);
  }
}
