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
    'certifications',
  ],
} as const;
