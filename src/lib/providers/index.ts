import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { Settings, activeCreds } from '../types';
import { LLMProvider } from './shared';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { friendlyError } from '../errors';

export type { LLMProvider, GenerateArgs } from './shared';

// Build the provider for the currently selected option in settings.
export function getProvider(settings: Settings): LLMProvider {
  const { apiKey, model } = activeCreds(settings);
  switch (settings.provider) {
    case 'openai':
      return new OpenAIProvider(apiKey, model);
    case 'anthropic':
    default:
      return new AnthropicProvider(apiKey, model);
  }
}

// Verify the active key with a free models-list call so the user learns about
// a bad key at save time, not on their first generation. Returns null when the
// key works, otherwise a user-facing error message.
export async function checkCredentials(settings: Settings): Promise<string | null> {
  const { apiKey } = activeCreds(settings);
  try {
    if (settings.provider === 'openai') {
      await new OpenAI({ apiKey, dangerouslyAllowBrowser: true }).models.list();
    } else {
      await new Anthropic({ apiKey, dangerouslyAllowBrowser: true }).models.list({ limit: 1 });
    }
    return null;
  } catch (e) {
    return friendlyError(e);
  }
}
