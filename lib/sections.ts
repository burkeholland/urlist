import type { DraftSection, LinkWithId, ListSection } from './types';

export const DEFAULT_SECTION_ID = 'default';
export const DEFAULT_SECTION_NAME = 'Links';
export const MAX_SECTIONS = 50;
export const MAX_SECTION_NAME_LENGTH = 80;

type LinkLike = {
  id: string;
  sectionId?: string | null;
  position: number;
  pinned?: boolean;
};

export function createDefaultSection(): ListSection {
  return { id: DEFAULT_SECTION_ID, name: DEFAULT_SECTION_NAME, position: 0 };
}

export function sortSections<T extends { position: number; id: string }>(sections: T[]): T[] {
  return [...sections].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function sortLinks<T extends LinkLike>(links: T[]): T[] {
  return [...links].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function normalizeSections(sections: ListSection[] | null | undefined): ListSection[] {
  if (!sections || sections.length === 0) return [createDefaultSection()];

  const seen = new Set<string>();
  const normalized = sections
    .filter((section) => section.id && section.name.trim().length > 0 && !seen.has(section.id) && seen.add(section.id))
    .map((section, index) => ({
      id: section.id,
      name: section.name.trim().slice(0, MAX_SECTION_NAME_LENGTH),
      position: Number.isInteger(section.position) && section.position >= 0 ? section.position : index,
    }));

  return normalized.length > 0 ? sortSections(normalized).map((section, index) => ({ ...section, position: index })) : [createDefaultSection()];
}

export function normalizeLinkSections<T extends LinkLike>(links: T[], sections: ListSection[]): Array<T & { sectionId: string }> {
  const normalizedSections = normalizeSections(sections);
  const validSectionIds = new Set(normalizedSections.map((section) => section.id));
  const fallbackSectionId = normalizedSections[0].id;

  return links.map((link) => ({
    ...link,
    sectionId: link.sectionId && validSectionIds.has(link.sectionId) ? link.sectionId : fallbackSectionId,
  }));
}

export function findDuplicateSectionId(sections: ListSection[]): string | null {
  const seen = new Set<string>();
  for (const section of sections) {
    if (seen.has(section.id)) return section.id;
    seen.add(section.id);
  }
  return null;
}

export function findOrphanSectionReference(links: Array<{ sectionId?: string | null }>, sections: ListSection[]): string | null {
  const sectionIds = new Set(sections.map((section) => section.id));
  for (const link of links) {
    if (link.sectionId && !sectionIds.has(link.sectionId)) return link.sectionId;
  }
  return null;
}

export function reindexLinksBySection<T extends LinkLike>(links: T[], sections: ListSection[]): Array<T & { sectionId: string; position: number }> {
  const normalizedSections = normalizeSections(sections);
  const sectionIds = new Set(normalizedSections.map((section) => section.id));
  const fallbackSectionId = normalizedSections[0].id;
  const normalizedLinks = links.map((link) => ({
    ...link,
    sectionId: link.sectionId && sectionIds.has(link.sectionId) ? link.sectionId : fallbackSectionId,
  }));

  return normalizedLinks.map((link) => ({
    ...link,
    position: normalizedLinks
      .filter((candidate) => candidate.sectionId === link.sectionId)
      .sort((a, b) => a.position - b.position)
      .findIndex((candidate) => candidate.id === link.id),
  }));
}

export function getLinksForSection<T extends LinkLike>(links: T[], sectionId: string): T[] {
  return sortLinks(links.filter((link) => link.sectionId === sectionId));
}

export function hasExplicitSections(sections: ListSection[]): boolean {
  const normalized = normalizeSections(sections);
  return normalized.length > 1 || normalized[0].id !== DEFAULT_SECTION_ID || normalized[0].name !== DEFAULT_SECTION_NAME;
}

export function getPublicSectionGroups(links: LinkWithId[], sections: ListSection[]) {
  const normalizedSections = normalizeSections(sections);
  const normalizedLinks = normalizeLinkSections(links, normalizedSections);
  const nonPinnedLinks = normalizedLinks.filter((link) => !link.pinned);

  return normalizedSections
    .map((section) => ({
      section,
      links: getLinksForSection(nonPinnedLinks, section.id),
    }))
    .filter((group) => group.links.length > 0);
}

export function coerceDraftSections(sections: DraftSection[] | null | undefined): DraftSection[] {
  return normalizeSections(sections) as DraftSection[];
}
