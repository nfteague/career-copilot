import { describe, expect, it } from 'vitest';
import { CareerProfile, emptyProfile } from './types';

// The Review tab's "Export profile (JSON)" is a raw JSON.stringify of the
// profile, and the planned import (#4) parses that same shape back. These
// tests lock the export shape so new profile fields can't silently fall out
// of the portability pair.

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
  p.languages.push('German (C1)');
  p.supportingDocs.push({
    id: 'd1',
    label: 'Old cover letter',
    content: 'body',
    addedAt: '2026-01-01',
    category: 'cover_letter',
  });
  p.qa.push({
    id: 'q1',
    question: 'Why do you want to work here?',
    answer: 'The mission.',
    addedAt: '2026-01-01',
  });
  p.resume = { filename: 'ada-resume.pdf', uploadedAt: '2026-01-01' };
  p.narrative = 'Things resumes leave out.';
  p.preferences.customInstructions = 'Never use em dashes.';
  return p;
}

describe('profile export shape (JSON round-trip)', () => {
  it('serializes every field of the current profile losslessly', () => {
    const p = populated();
    const roundTripped = JSON.parse(JSON.stringify(p)) as CareerProfile;
    expect(roundTripped).toEqual(p);
  });

  it('carries the fields added in 0.2.0 that an importer must preserve', () => {
    const parsed = JSON.parse(JSON.stringify(populated()));
    expect(parsed.qa).toHaveLength(1);
    expect(parsed.resume).toEqual({ filename: 'ada-resume.pdf', uploadedAt: '2026-01-01' });
    expect(parsed.supportingDocs[0].category).toBe('cover_letter');
    expect(parsed.preferences.customInstructions).toBe('Never use em dashes.');
    // Legacy field still present (empty) for pre-0.2.0 import compatibility.
    expect(parsed.notes).toEqual([]);
  });

  it('omits unset optional keys — absence means default on import', () => {
    const json = JSON.stringify(emptyProfile());
    expect(json).not.toContain('"resume"');
    expect(json).not.toContain('"customInstructions"');
  });
});
