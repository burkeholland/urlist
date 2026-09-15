'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';
import type { DraftLink, DraftSection } from '@/lib/types';
import { getLinksForSection, sortSections } from '@/lib/sections';
import { SortableLinkList } from './sortable-link-list';

interface SectionedLinkListProps {
  sections: DraftSection[];
  links: DraftLink[];
  onAddSection: () => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onReorderSections: (sections: DraftSection[]) => void;
  onLinksChange: (links: DraftLink[]) => void;
  onDeleteLink: (id: string) => void;
  onUpdateLink?: (id: string, updates: Partial<DraftLink>) => void;
  onPinLink?: (id: string) => void;
  onMoveLinkToSection?: (id: string, sectionId: string) => void;
}

function SectionShell({
  section,
  index,
  total,
  children,
  onRenameSection,
  onDeleteSection,
  onMoveSection,
}: {
  section: DraftSection;
  index: number;
  total: number;
  children: ReactNode;
  onRenameSection: (sectionId: string, name: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onMoveSection: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        background: 'var(--surface)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius)',
        padding: 12,
      }}
      aria-label={`Section ${section.name}`}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag section ${section.name} to reorder`}
          className="btn btn-outline"
          style={{ height: 34, padding: '0 8px', cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          ☰
        </button>
        <label style={{ flex: 1, minWidth: 0 }}>
          <span className="label" style={{ marginBottom: 2 }}>Heading</span>
          <input
            className="input"
            value={section.name}
            onChange={(e) => onRenameSection(section.id, e.target.value)}
            aria-label={`Section heading ${section.name}`}
            maxLength={80}
          />
        </label>
        <div style={{ display: 'flex', gap: 4, alignSelf: 'end' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onMoveSection(index, index - 1)}
            disabled={index === 0}
            aria-label={`Move section ${section.name} up`}
            style={{ opacity: index === 0 ? 0.45 : undefined }}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onMoveSection(index, index + 1)}
            disabled={index === total - 1}
            aria-label={`Move section ${section.name} down`}
            style={{ opacity: index === total - 1 ? 0.45 : undefined }}
          >
            ↓
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onDeleteSection(section.id)}
            disabled={total === 1}
            title={total === 1 ? 'A list needs at least one section' : 'Delete section and move its links to another section'}
            aria-label={`Delete section ${section.name}`}
            style={{ opacity: total === 1 ? 0.45 : undefined }}
          >
            Delete
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

export function SectionedLinkList({
  sections,
  links,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  onReorderSections,
  onLinksChange,
  onDeleteLink,
  onUpdateLink,
  onPinLink,
  onMoveLinkToSection,
}: SectionedLinkListProps) {
  const orderedSections = sortSections(sections);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = orderedSections.findIndex((section) => section.id === active.id);
      const newIndex = orderedSections.findIndex((section) => section.id === over.id);
      onReorderSections(arrayMove(orderedSections, oldIndex, newIndex).map((section, position) => ({ ...section, position })));
    }
  }

  function handleMoveSection(from: number, to: number) {
    if (to < 0 || to >= orderedSections.length || from === to) return;
    onReorderSections(arrayMove(orderedSections, from, to).map((section, position) => ({ ...section, position })));
  }

  function handleSectionLinksChange(sectionId: string, reorderedSectionLinks: DraftLink[]) {
    const otherLinks = links.filter((link) => link.sectionId !== sectionId);
    onLinksChange([...otherLinks, ...reorderedSectionLinks.map((link, position) => ({ ...link, sectionId, position }))]);
  }

  return (
    <div>
      <div className="section-head">
        <h2>
          Sections <span className="count-badge">{orderedSections.length}</span>
        </h2>
        <button type="button" className="btn btn-outline" onClick={onAddSection}>
          Add section
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedSections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orderedSections.map((section, index) => {
              const sectionLinks = getLinksForSection(links, section.id);
              return (
                <SectionShell
                  key={section.id}
                  section={section}
                  index={index}
                  total={orderedSections.length}
                  onRenameSection={onRenameSection}
                  onDeleteSection={onDeleteSection}
                  onMoveSection={handleMoveSection}
                >
                  <SortableLinkList
                    links={sectionLinks}
                    onReorder={(reordered) => handleSectionLinksChange(section.id, reordered)}
                    onDelete={onDeleteLink}
                    onUpdate={onUpdateLink}
                    onPin={onPinLink}
                    sections={orderedSections}
                    onMoveToSection={onMoveLinkToSection}
                    emptyMessage="No links in this section yet."
                  />
                </SectionShell>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
