import fs from "fs/promises";
import path from "path";
import type {
  Locale,
  ExperienceEntry,
  EducationEntry,
  CertificateEntry,
  PublicationEntry,
  AboutData,
  ProjectFrontmatter,
} from "./types";

const contentDir = path.join(process.cwd(), "content");

async function loadJson<T>(locale: Locale, file: string): Promise<T> {
  const filePath = path.join(contentDir, locale, "data", file);
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

export async function getExperience(locale: Locale) {
  return loadJson<ExperienceEntry[]>(locale, "experience.json");
}

export async function getEducation(locale: Locale) {
  return loadJson<EducationEntry[]>(locale, "education.json");
}

export async function getCertificates(locale: Locale) {
  return loadJson<CertificateEntry[]>(locale, "certificates.json");
}

export async function getAbout(locale: Locale) {
  return loadJson<AboutData>(locale, "about.json");
}

export async function getProjectSlugs(): Promise<string[]> {
  const projectsDir = path.join(contentDir, "en", "projects");
  const files = await fs.readdir(projectsDir);
  return files
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export async function getProjectSource(
  locale: Locale,
  slug: string
): Promise<string> {
  const filePath = path.join(contentDir, locale, "projects", `${slug}.mdx`);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    // Fall back to English if locale version doesn't exist
    const fallbackPath = path.join(contentDir, "en", "projects", `${slug}.mdx`);
    return fs.readFile(fallbackPath, "utf-8");
  }
}

export async function getPublications(locale: Locale): Promise<PublicationEntry[]> {
  const filePath = path.join(contentDir, locale, "data", "publications.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    // Fall back to English if locale version doesn't exist
    const fallbackPath = path.join(contentDir, "en", "data", "publications.json");
    const raw = await fs.readFile(fallbackPath, "utf-8");
    return JSON.parse(raw);
  }
}
