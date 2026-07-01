import { Settings, activeCreds } from '../types';
import { LLMProvider } from './shared';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';

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
