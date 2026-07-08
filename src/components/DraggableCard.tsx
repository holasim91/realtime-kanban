import { useDraggable } from "@dnd-kit/core";
import type { Card } from "../lib/type";


export function DraggableCard({ card, onRemove }: { card: Card; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: card.id })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        padding: 12,
        marginBottom: 8,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 6,
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px)`
          : undefined,
      }}
    >
      {card.title}
         <button
        onClick={() => onRemove(card.id)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
      >
        ×
      </button>
    </div>
  )
}
