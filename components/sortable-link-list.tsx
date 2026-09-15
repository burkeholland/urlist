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
import type { DraftLink, DraftSection } from '@/lib/types';
import { LinkCard } from './link-card';

interface SortableLinkListProps {
  links: DraftLink[];
  onReorder: (links: DraftLink[]) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<DraftLink>) => void;
  onPin?: (id: string) => void;
  sections?: DraftSection[];
  onMoveToSection?: (id: string, sectionId: string) => void;
  emptyMessage?: string;
}

function SortableItem({
  link,
  index,
  total,
  sections,
  onDelete,
  onUpdate,
  onPin,
  onMoveToSection,
  onMoveWithinSection,
}: {
  link: DraftLink;
  index: number;
  total: number;
  sections?: DraftSection[];
  onDelete: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<DraftLink>) => void;
  onPin?: (id: string) => void;
  onMoveToSection?: (id: string, sectionId: string) => void;
  onMoveWithinSection: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: link.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          {...listeners}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            padding: 4,
            borderRadius: 4,
            color: 'var(--text-muted)',
            background: 'none',
            border: 'none',
          }}
          aria-label="Drag to reorder"
        >
          <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <LinkCard link={link} onDelete={onDelete} onUpdate={onUpdate} onPin={onPin} />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            alignSelf: 'stretch',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onMoveWithinSection(index, index - 1)}
            disabled={index === 0}
            aria-label={`Move ${link.ogTitle || link.url} up`}
            style={{ height: 24, padding: '0 8px', opacity: index === 0 ? 0.45 : undefined }}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onMoveWithinSection(index, index + 1)}
            disabled={index === total - 1}
            aria-label={`Move ${link.ogTitle || link.url} down`}
            style={{ height: 24, padding: '0 8px', opacity: index === total - 1 ? 0.45 : undefined }}
          >
            ↓
          </button>
        </div>
        {sections && onMoveToSection && sections.length > 1 ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 130, fontSize: 12, color: 'var(--text-muted)' }}>
            Section
            <select
              className="input"
              value={link.sectionId}
              onChange={(e) => onMoveToSection(link.id, e.target.value)}
              aria-label={`Move ${link.ogTitle || link.url} to section`}
              style={{ height: 30, fontSize: 13, padding: '0 6px' }}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}

export function SortableLinkList({ links, onReorder, onDelete, onUpdate, onPin, sections, onMoveToSection, emptyMessage = 'No links added yet. Paste a URL above to get started.' }: SortableLinkListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = links.findIndex((l) => l.id === active.id);
      const newIndex = links.findIndex((l) => l.id === over.id);
      onReorder(arrayMove(links, oldIndex, newIndex));
    }
  }

  if (links.length === 0) {
    return (
      <div
        style={{
          padding: '32px 0',
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 15,
          color: 'var(--text-muted)',
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  function handleMoveWithinSection(from: number, to: number) {
    if (to < 0 || to >= links.length || from === to) return;
    onReorder(arrayMove(links, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={links.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {links.map((link, index) => (
            <SortableItem
              key={link.id}
              link={link}
              index={index}
              total={links.length}
              sections={sections}
              onDelete={onDelete}
              onUpdate={onUpdate}
              onPin={onPin}
              onMoveToSection={onMoveToSection}
              onMoveWithinSection={handleMoveWithinSection}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
