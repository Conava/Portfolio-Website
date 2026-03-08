import { compileMDX } from "next-mdx-remote/rsc";
import {
  getExperience,
  getEducation,
  getCertificates,
  getPublications,
  getAbout,
  getProjectSlugs,
  getProjectSource,
} from "@/lib/content";
import type { Locale, ProjectFrontmatter } from "@/lib/types";
import { siteConfig } from "@/lib/site-config";
import { toRoman } from "@/lib/utils";
import { Hero } from "@/components/sections/hero";
import { About } from "@/components/sections/about";
import { Experience } from "@/components/sections/experience";
import { Education } from "@/components/sections/education";
import { Projects } from "@/components/sections/projects";
import { Certificates } from "@/components/sections/certificates";
import { Publications } from "@/components/sections/publications";
import { Footer } from "@/components/sections/footer";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Home({ params }: Props) {
  const { locale } = await params;
  const loc = locale as Locale;

  const [about, experience, education, certificates, publications, slugs] = await Promise.all([
    getAbout(loc),
    getExperience(loc),
    getEducation(loc),
    getCertificates(loc),
    getPublications(loc),
    getProjectSlugs(),
  ]);

  // Filter hidden entries — set hidden: false in the JSON to re-enable
  const visibleEducation = education.filter((e) => !e.hidden);
  const visibleCertificates = certificates.filter((c) => !c.hidden);
  const visiblePublications = publications.filter((p) => !p.hidden);

  // Load frontmatter for all projects
  const allProjects = await Promise.all(
    slugs.map(async (slug) => {
      const source = await getProjectSource(loc, slug);
      const { frontmatter } = await compileMDX<ProjectFrontmatter>({
        source,
        options: { parseFrontmatter: true },
      });
      return { ...frontmatter, slug };
    })
  );

  // Portfolio page: exclude hidden and hideFromPortfolio projects
  const sortedProjects = allProjects
    .filter((p) => !p.hidden && !p.hideFromPortfolio)
    .sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return b.date.localeCompare(a.date);
    });

  // Dynamic section numbering — Hero counts as section 1 (not displayed)
  let sectionCounter = 1; // Hero = I
  const idx = {
    about:        toRoman(++sectionCounter), // II
    experience:   toRoman(++sectionCounter), // III
    education:    toRoman(++sectionCounter), // IV
    projects:     toRoman(++sectionCounter), // V
    certificates: visibleCertificates.length > 0 ? toRoman(++sectionCounter) : undefined,
    publications: visiblePublications.length > 0 ? toRoman(++sectionCounter) : undefined,
    contact:      toRoman(++sectionCounter),
  };

  return (
    <main>
      <Hero name={siteConfig.name} projectCount={allProjects.length} />
      <About data={about} index={idx.about} />
      <Experience entries={experience} index={idx.experience} />
      <Education entries={visibleEducation} index={idx.education} />
      <Projects projects={sortedProjects} index={idx.projects} />
      {/* Certificates: shown automatically when visibleCertificates has entries.
          To add a certificate: set hidden: false on the entry in certificates.json
          and uncomment "certificates" or "publications" in navbar.tsx */}
      {visibleCertificates.length > 0 && (
        <Certificates entries={visibleCertificates} index={idx.certificates} />
      )}
      {visiblePublications.length > 0 && (
        <Publications entries={visiblePublications} index={idx.publications} />
      )}
      <Footer index={idx.contact} />
    </main>
  );
}
