import { describe, expect, it } from 'vitest';
import { toProfile, toTailoredResult } from './shared';
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

describe('toTailoredResult', () => {
  const resumeFields = {
    header: { name: 'Ada', headline: '', location: '', email: '', phone: '', links: [] },
    summary: 'Built X.',
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    skills: ['TypeScript'],
    languages: [],
  };

  it('splits strategy and gaps out of the resume content', () => {
    const raw = JSON.stringify({
      strategy: 'Voice AI company; lead with the audio project.',
      gaps: ['Node.js', 'Python'],
      ...resumeFields,
    });
    const { resume, gaps } = toTailoredResult(raw);
    expect(gaps).toEqual(['Node.js', 'Python']);
    expect(resume).toEqual(resumeFields);
    expect(resume).not.toHaveProperty('strategy');
    expect(resume).not.toHaveProperty('gaps');
  });

  it('normalizes a missing or malformed gaps field to an empty array', () => {
    expect(toTailoredResult(JSON.stringify({ strategy: 's', ...resumeFields })).gaps).toEqual([]);
    expect(
      toTailoredResult(JSON.stringify({ strategy: 's', gaps: 'Node.js', ...resumeFields })).gaps,
    ).toEqual([]);
  });

  it('drops empty gap strings', () => {
    const raw = JSON.stringify({ strategy: 's', gaps: ['', 'Python'], ...resumeFields });
    expect(toTailoredResult(raw).gaps).toEqual(['Python']);
  });
});
