// JSON Schema passed to the model via output_config.format so resume/brain-dump
// ingestion returns a validated CareerProfile-shaped object. Mirrors the parts
// of types.ts the model is responsible for filling — preferences/updatedAt are
// added client-side, not by the model.

export const PROFILE_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    basics: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        location: { type: 'string' },
        headline: { type: 'string' },
        summary: { type: 'string' },
        links: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              url: { type: 'string' },
            },
            required: ['label', 'url'],
          },
        },
      },
      required: ['name', 'email', 'phone', 'location', 'headline', 'summary', 'links'],
    },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          company: { type: 'string' },
          title: { type: 'string' },
          location: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          current: { type: 'boolean' },
          summary: { type: 'string' },
          highlights: { type: 'array', items: { type: 'string' } },
          skills: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'company',
          'title',
          'location',
          'startDate',
          'endDate',
          'current',
          'summary',
          'highlights',
          'skills',
        ],
      },
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          institution: { type: 'string' },
          degree: { type: 'string' },
          field: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          details: { type: 'string' },
        },
        required: ['institution', 'degree', 'field', 'startDate', 'endDate', 'details'],
      },
    },
    projects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          description: { type: 'string' },
          highlights: { type: 'array', items: { type: 'string' } },
          technologies: { type: 'array', items: { type: 'string' } },
          link: { type: 'string' },
        },
        required: ['name', 'role', 'description', 'highlights', 'technologies', 'link'],
      },
    },
    skills: { type: 'array', items: { type: 'string' } },
    languages: { type: 'array', items: { type: 'string' } },
    certifications: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          issuer: { type: 'string' },
          date: { type: 'string' },
        },
        required: ['name', 'issuer', 'date'],
      },
    },
  },
  required: [
    'basics',
    'experience',
    'education',
    'projects',
    'skills',
    'languages',
    'certifications',
  ],
} as const;

// Schema for tailorResume — same OpenAI-strict conventions as above (every
// object additionalProperties: false, all properties required; "absent" is
// expressed as an empty string or array).
// `strategy` and `gaps` come FIRST: constrained decoding emits properties in
// schema order, so the model must commit to a positioning analysis (company,
// distinctive asks, differentiator, JD-requirement coverage) before writing a
// single resume line. `strategy` is dropped client-side; `gaps` feeds the
// side panel (see TailoredResumeResult in types.ts).
export const TAILORED_RESUME_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    strategy: { type: 'string' },
    gaps: { type: 'array', items: { type: 'string' } },
    header: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        headline: { type: 'string' },
        location: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        links: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'headline', 'location', 'email', 'phone', 'links'],
    },
    summary: { type: 'string' },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          company: { type: 'string' },
          title: { type: 'string' },
          dates: { type: 'string' },
          description: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
        required: ['company', 'title', 'dates', 'description', 'bullets'],
      },
    },
    projects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'description', 'bullets'],
      },
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          institution: { type: 'string' },
          degree: { type: 'string' },
          dates: { type: 'string' },
        },
        required: ['institution', 'degree', 'dates'],
      },
    },
    certifications: { type: 'array', items: { type: 'string' } },
    skills: { type: 'array', items: { type: 'string' } },
    languages: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'strategy',
    'gaps',
    'header',
    'summary',
    'experience',
    'projects',
    'education',
    'certifications',
    'skills',
    'languages',
  ],
} as const;

// Schema for extractResumeStyle — the visual design of an uploaded resume as
// renderer tokens (see ResumeStyle in types.ts). Same strict conventions.
export const RESUME_STYLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    font: { type: 'string', enum: ['sans', 'serif', 'mixed'] },
    accent: { type: 'string' },
    headerAlign: { type: 'string', enum: ['left', 'center'] },
    density: { type: 'string', enum: ['comfortable', 'compact'] },
    sectionCase: { type: 'string', enum: ['uppercase', 'title'] },
    divider: { type: 'string', enum: ['line', 'none'] },
    sectionOrder: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'summary',
          'experience',
          'projects',
          'education',
          'certifications',
          'skills',
          'languages',
        ],
      },
    },
  },
  required: ['font', 'accent', 'headerAlign', 'density', 'sectionCase', 'divider', 'sectionOrder'],
} as const;
