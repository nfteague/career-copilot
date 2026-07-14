import { describe, expect, it } from 'vitest';
import { applyHidden } from './tailoredResume';
import { TailoredResume } from './types';

function resume(): TailoredResume {
  return {
    header: { name: 'Ada', headline: '', location: '', email: '', phone: '', links: [] },
    summary: 'SUMMARY',
    experience: [
      { company: 'Acme', title: 'PM', dates: '', description: '', bullets: ['a'] },
      { company: 'Initech', title: 'Analyst', dates: '', description: '', bullets: ['b'] },
    ],
    projects: [{ name: 'Proj', description: '', bullets: [] }],
    education: [{ institution: 'MIT', degree: '', dates: '' }],
    certifications: ['PMP'],
    skills: ['sql'],
  };
}

describe('applyHidden', () => {
  it('returns the resume untouched without hidden parts', () => {
    const r = resume();
    expect(applyHidden(r)).toBe(r);
    expect(applyHidden(r, { sections: [], experience: [], projects: [] })).toEqual(r);
  });

  it('blanks hidden sections and filters hidden entries by index', () => {
    const out = applyHidden(resume(), {
      sections: ['summary', 'skills'],
      experience: [0],
      projects: [],
    });
    expect(out.summary).toBe('');
    expect(out.skills).toEqual([]);
    expect(out.experience).toHaveLength(1);
    expect(out.experience[0].company).toBe('Initech');
    expect(out.education).toHaveLength(1); // untouched sections survive
  });

  it('hiding a whole section wins over entry-level toggles', () => {
    const out = applyHidden(resume(), { sections: ['experience'], experience: [1], projects: [] });
    expect(out.experience).toEqual([]);
  });
});
