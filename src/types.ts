export interface ComponentMeta {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  libraries: string[];
  sourceUrl: string;
  createdAt: string;
}

export interface ExtractedComponent {
  name: string;
  description: string;
  tags: string[];
  libraries: string[];
  html: string;
}

export interface PromptRecord {
  filename: string;
  createdAt: string;
  componentSlugs: string[];
  context: string;
  content: string;
}
