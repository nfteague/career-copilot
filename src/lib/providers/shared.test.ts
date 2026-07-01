import { describe, expect, it } from 'vitest';
import { toProfile } from './shared';
import { emptyProfile } from '../types';

describe('toProfile', () => {
  const extracted = {
    basics: { name: 'Ada Lovelace', email: '', phone: '', location: '', headline: '', summary: '', links: [] },
    experience: [
      { company: 'Acme', title: 'Engineer', highlights: ['Shipped X'], skills: ['ts'] },
    ],
    education: [],
    projects: [],
    skills: ['ts'],
    certifications: [],
  };

  it('mints ids for every entry', () => {
    const p = toProfile(extracted);
    expect(p.experience[0].id).toBeTruthy();
    expect(p.experience[0].company).toBe('Acme');
  });

  it('preserves narrative, preferences, notes, and docs from the base profile', () => {
    const base = emptyProfile();
    base.narrative = 'my story';
    base.preferences = { tone: 'direct', length: 'concise' };
    base.notes.push({ id: 'n1', content: 'led payments migration', addedAt: '2026-01-01' });
    base.supportingDocs.push({ id: 'd1', label: 'Case study', content: 'x', addedAt: '2026-01-01' });

    const p = toProfile(extracted, base);
    expect(p.narrative).toBe('my story');
    expect(p.preferences).toEqual({ tone: 'direct', length: 'concise' });
    expect(p.notes).toHaveLength(1);
    expect(p.supportingDocs).toHaveLength(1);
  });

  it('keeps the base name when the extraction has none', () => {
    const base = emptyProfile();
    base.basics.name = 'Existing Name';
    const p = toProfile({ ...extracted, basics: { ...extracted.basics, name: undefined } }, base);
    expect(p.basics.name).toBe('Existing Name');
  });
});
