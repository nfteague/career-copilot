import { describe, expect, it } from 'vitest';
import { parseProfileJson } from './importProfile';
import { CareerProfile, DEFAULT_PREFERENCES, emptyProfile } from './types';

function populated(): CareerProfile {
  const p = emptyProfile();
  p.basics.name = 'Ada Lovelace';
  p.basics.links.push({ label: 'Site', url: 'https://example.com' });
  p.experience.push({
    id: 'e1',
    company: 'Acme',
    title: 'PM',
    highlights: ['Shipped X'],
    skills: ['roadmaps'],
  });
  p.skills.push('analysis');
  p.supportingDocs.push({
    id: 'd1',
    label: 'Old cover letter',
    content: 'body',
    addedAt: '2026-01-01',
    category: 'cover_letter',
  });
  p.qa.push({ id: 'q1', question: 'Why here?', answer: 'Mission.', addedAt: '2026-01-01' });
  p.resume = { filename: 'ada.pdf', uploadedAt: '2026-01-01' };
  p.resumeStyle = {
    font: 'serif',
    accent: '#1e3a5f',
    headerAlign: 'center',
    density: 'comfortable',
    sectionCase: 'title',
    divider: 'line',
    sectionOrder: ['summary', 'experience', 'education', 'skills'],
  };
  p.narrative = 'Context resumes leave out.';
  p.preferences.customInstructions = 'Never use em dashes.';
  return p;
}

describe('parseProfileJson', () => {
  it('round-trips a current export losslessly (ids preserved, updatedAt refreshed)', () => {
    const original = populated();
    const parsed = parseProfileJson(JSON.stringify(original));
    expect(parsed).not.toBeNull();
    const got = parsed as CareerProfile;
    expect({ ...got, updatedAt: '' }).toEqual({ ...original, updatedAt: '' });
  });

  it('rejects malformed JSON and non-object roots', () => {
    expect(parseProfileJson('not json {')).toBeNull();
    expect(parseProfileJson('[1,2,3]')).toBeNull();
    expect(parseProfileJson('42')).toBeNull();
    expect(parseProfileJson('"a string"')).toBeNull();
    expect(parseProfileJson('null')).toBeNull();
  });

  it('rejects unrelated JSON objects (recognition heuristic)', () => {
    expect(parseProfileJson(JSON.stringify({ messages: [], meta: { app: 'other' } }))).toBeNull();
  });

  it('mints ids for entries missing them', () => {
    const parsed = parseProfileJson(
      JSON.stringify({ experience: [{ company: 'Acme', title: 'PM' }], skills: [] }),
    );
    expect(parsed?.experience[0].id).toMatch(/[0-9a-f-]{36}/);
  });

  it('replaces non-array collection fields with empty arrays', () => {
    const parsed = parseProfileJson(
      JSON.stringify({ basics: { name: 'A' }, experience: 'nope', qa: 7, supportingDocs: null }),
    );
    expect(parsed?.experience).toEqual([]);
    expect(parsed?.qa).toEqual([]);
    expect(parsed?.supportingDocs).toEqual([]);
  });

  it('keeps only string skills and defaults missing entry sub-arrays', () => {
    const parsed = parseProfileJson(
      JSON.stringify({ skills: ['ok', 42, null, 'also ok'], experience: [{ company: 'Acme' }] }),
    );
    expect(parsed?.skills).toEqual(['ok', 'also ok']);
    expect(parsed?.experience[0].highlights).toEqual([]);
    expect(parsed?.experience[0].skills).toEqual([]);
  });

  it('falls back to default preferences on invalid values, keeping valid customInstructions', () => {
    const parsed = parseProfileJson(
      JSON.stringify({
        basics: {},
        preferences: { tone: 'sassy', length: 'concise', customInstructions: 'Always be brief.' },
      }),
    );
    expect(parsed?.preferences.tone).toBe(DEFAULT_PREFERENCES.tone);
    expect(parsed?.preferences.length).toBe('concise');
    expect(parsed?.preferences.customInstructions).toBe('Always be brief.');
  });

  it('drops non-string customInstructions and non-object preferences', () => {
    expect(
      parseProfileJson(JSON.stringify({ basics: {}, preferences: { customInstructions: 9 } }))
        ?.preferences.customInstructions,
    ).toBeUndefined();
    expect(
      parseProfileJson(JSON.stringify({ basics: {}, preferences: 'loud' }))?.preferences,
    ).toEqual(DEFAULT_PREFERENCES);
  });

  it('validates the resume marker shape', () => {
    expect(
      parseProfileJson(JSON.stringify({ basics: {}, resume: { filename: 'a.pdf', uploadedAt: 'x' } }))
        ?.resume,
    ).toEqual({ filename: 'a.pdf', uploadedAt: 'x' });
    expect(
      parseProfileJson(JSON.stringify({ basics: {}, resume: { filename: 7 } }))?.resume,
    ).toBeUndefined();
    expect(parseProfileJson(JSON.stringify({ basics: {}, resume: 'a.pdf' }))?.resume).toBeUndefined();
  });

  it('validates doc categories and keeps the legacy voice flag', () => {
    const parsed = parseProfileJson(
      JSON.stringify({
        basics: {},
        supportingDocs: [
          { label: 'a', content: 'x', category: 'writing_sample' },
          { label: 'b', content: 'y', category: 'bogus' },
          { label: 'c', content: 'z', kind: 'voice' },
          { label: 'dropped', content: 42 },
        ],
      }),
    );
    expect(parsed?.supportingDocs).toHaveLength(3);
    expect(parsed?.supportingDocs[0].category).toBe('writing_sample');
    expect(parsed?.supportingDocs[1].category).toBeUndefined();
    expect(parsed?.supportingDocs[2].kind).toBe('voice');
  });

  it('drops qa entries without string question and answer', () => {
    const parsed = parseProfileJson(
      JSON.stringify({
        basics: {},
        qa: [{ question: 'Q?', answer: 'A.' }, { question: 'Q2?' }, { answer: 5 }, 'junk'],
      }),
    );
    expect(parsed?.qa).toHaveLength(1);
    expect(parsed?.qa[0].question).toBe('Q?');
  });

  it('drops a malformed resumeStyle whole, keeps a valid one', () => {
    expect(
      parseProfileJson(JSON.stringify({ basics: {}, resumeStyle: { font: 'comic-sans' } }))
        ?.resumeStyle,
    ).toBeUndefined();
    expect(
      parseProfileJson(JSON.stringify({ basics: {}, resumeStyle: 'fancy' }))?.resumeStyle,
    ).toBeUndefined();
    const valid = populated().resumeStyle;
    const parsed = parseProfileJson(JSON.stringify({ basics: {}, resumeStyle: valid }));
    expect(parsed?.resumeStyle).toEqual(valid);
  });

  it('folds pre-0.2.0 notes into the narrative', () => {
    const parsed = parseProfileJson(
      JSON.stringify({
        narrative: 'Existing words.',
        notes: [{ id: 'n1', content: 'I led the payments rewrite.', addedAt: 'x' }],
      }),
    );
    expect(parsed?.notes).toEqual([]);
    expect(parsed?.narrative).toBe('Existing words.\n\nI led the payments rewrite.');
  });

  it('handles a non-object basics without producing char-indexed keys', () => {
    const parsed = parseProfileJson(JSON.stringify({ basics: 'Ada', skills: [] }));
    expect(parsed?.basics).toEqual(emptyProfile().basics);
  });

  it('preserves unknown top-level keys from future versions', () => {
    const parsed = parseProfileJson(JSON.stringify({ basics: {}, futureField: { a: 1 } }));
    expect((parsed as unknown as Record<string, unknown>)?.futureField).toEqual({ a: 1 });
  });
});
