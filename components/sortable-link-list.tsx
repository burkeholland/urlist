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
import type { DraftLink } from '@/lib/types';
import { LinkCard } from './link-card';

interface SortableLinkListProps {
  links: DraftLink[];
  onReorder: (links: DraftLink[]) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<DraftLink>) => void;
}

function SortableItem({ link, onDelete, onUpdate }: { link: DraftLink; onDelete: (id: string) => void; onUpdate?: (id: string, updates: Partial<DraftLink>) => void }) {
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
          <LinkCard link={link} onDelete={onDelete} onUpdate={onUpdate} />
        </div>
      </div>
    </div>
  );
}

export function SortableLinkList({ links, onReorder, onDelete, onUpdate }: SortableLinkListProps) {
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
      const reordered = arrayMove(links, oldIndex, newIndex);
      onReorder(reordered);
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
        No links added yet. Paste a URL above to get started.
      </div>
    );
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
          {links.map((link) => (
            <SortableItem key={link.id} link={link} onDelete={onDelete} onUpdate={onUpdate} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
