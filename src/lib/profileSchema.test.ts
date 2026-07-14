import { describe, expect, it } from 'vitest';
import {
  PROFILE_EXTRACTION_SCHEMA,
  RESUME_STYLE_SCHEMA,
  TAILORED_RESUME_SCHEMA,
} from './profileSchema';

// OpenAI strict mode requires every object to set additionalProperties: false
// and list ALL of its properties as required. Walk each schema and assert it,
// so a careless edit can't silently break the OpenAI provider.
function assertStrict(node: Record<string, unknown>, path: string) {
  if (node.type === 'object') {
    expect(node.additionalProperties, `${path} additionalProperties`).toBe(false);
    const properties = node.properties as Record<string, Record<string, unknown>>;
    expect((node.required as string[]).slice().sort(), `${path} required`).toEqual(
      Object.keys(properties).sort(),
    );
    for (const [key, child] of Object.entries(properties)) assertStrict(child, `${path}.${key}`);
  }
  if (node.type === 'array') {
    assertStrict(node.items as Record<string, unknown>, `${path}[]`);
  }
}

describe('structured-output schemas are OpenAI-strict-compatible', () => {
  it('PROFILE_EXTRACTION_SCHEMA', () => {
    assertStrict(PROFILE_EXTRACTION_SCHEMA as unknown as Record<string, unknown>, 'extraction');
  });

  it('TAILORED_RESUME_SCHEMA', () => {
    assertStrict(TAILORED_RESUME_SCHEMA as unknown as Record<string, unknown>, 'resume');
  });

  it('RESUME_STYLE_SCHEMA', () => {
    assertStrict(RESUME_STYLE_SCHEMA as unknown as Record<string, unknown>, 'style');
  });
});
