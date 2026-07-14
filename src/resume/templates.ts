import { ResumeSectionKey, ResumeStyle } from '../lib/types';

// Pre-built looks for the tailored-resume page, plus 'match' — the style
// extracted from the user's own uploaded resume when one exists.
export type TemplateId = 'modern' | 'classic' | 'compact' | 'executive' | 'match';

export const DEFAULT_SECTION_ORDER: ResumeSectionKey[] = [
  'summary',
  'experience',
  'projects',
  'education',
  'certifications',
  'skills',
];

export const TEMPLATES: Record<Exclude<TemplateId, 'match'>, ResumeStyle> = {
  modern: {
    font: 'sans',
    accent: '',
    headerAlign: 'left',
    density: 'comfortable',
    sectionCase: 'uppercase',
    divider: 'line',
    sectionOrder: DEFAULT_SECTION_ORDER,
  },
  classic: {
    font: 'serif',
    accent: '',
    headerAlign: 'center',
    density: 'comfortable',
    sectionCase: 'title',
    divider: 'line',
    sectionOrder: DEFAULT_SECTION_ORDER,
  },
  compact: {
    font: 'sans',
    accent: '',
    headerAlign: 'left',
    density: 'compact',
    sectionCase: 'uppercase',
    divider: 'none',
    sectionOrder: DEFAULT_SECTION_ORDER,
  },
  executive: {
    font: 'mixed',
    accent: '#1e3a5f',
    headerAlign: 'center',
    density: 'comfortable',
    sectionCase: 'title',
    divider: 'line',
    sectionOrder: DEFAULT_SECTION_ORDER,
  },
};

export const TEMPLATE_LABELS: Record<Exclude<TemplateId, 'match'>, string> = {
  modern: 'Modern',
  classic: 'Classic',
  compact: 'Compact',
  executive: 'Executive',
};

export const DEFAULT_TEMPLATE: TemplateId = 'modern';

// Normalize an extracted style before rendering: accents must be real hex
// colors, and every section must appear somewhere in the order.
export function safeStyle(style: ResumeStyle): ResumeStyle {
  const order = style.sectionOrder ?? [];
  return {
    ...style,
    accent: /^#[0-9a-fA-F]{6}$/.test(style.accent) ? style.accent : '',
    sectionOrder: [...order, ...DEFAULT_SECTION_ORDER.filter((s) => !order.includes(s))],
  };
}
