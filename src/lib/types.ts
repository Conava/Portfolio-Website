export type Locale = "en" | "de";

export interface ExperienceEntry {
  id: string;
  company: string;
  role: string;
  period: string;
  location: string;
  summary: string;
  details: string[];
  tech: string[];
}

export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  field: string;
  period: string;
  status: "completed" | "upcoming" | "in-progress";
  summary: string;
  details: string[];
  hidden?: boolean;
  thesis?: {
    title: string;
    summary: string;
    projectSlug: string;
    githubUrl: string;
  };
}

export interface CertificateEntry {
  id: string;
  name: string;
  issuer: string;
  date: string;
  summary: string;
  details: string;
  url?: string;
  hidden?: boolean;
}

export interface AboutData {
  bio: string;
  skills: SkillCategory[];
}

export interface SkillCategory {
  category: string;
  items: string[];
}

export interface ProjectFrontmatter {
  title: string;
  date: string;
  summary: string;
  tech: string[];
  githubUrl?: string;
  thumbnail?: string;
  featured?: boolean;
  fullWidth?: boolean;
  hidden?: boolean;
  hideFromPortfolio?: boolean;
  status?: "active" | "completed" | "in-progress" | "discontinued" | "upcoming";
}

export interface PublicationEntry {
  id: string;
  title: string;
  year?: string;
  venue?: string;
  authors?: string[];
  description: string;
  projectSlug?: string;
  publishedUrl: string;
  pdfUrl?: string;
  hidden?: boolean;
}
