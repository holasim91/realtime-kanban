import { useDroppable } from "@dnd-kit/core"
import type { Card } from "../lib/type"
import { DraggableCard } from "./DraggableCard"

export function DroppableColumn({
  columnId,
  cards,
  onAddCard,
  onRemove
}: {
  columnId: string
  cards: Card[]
  onAddCard:(columnId: string) => void
  onRemove: (columnId: string) => void 
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId })
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        minHeight: 300,
        padding: 12,
        background: isOver ? '#eef' : '#f4f4f4',
        borderRadius: 8,
      }}
    >
      <h3 style={{ marginTop: 0 }}>{columnId}</h3>
            <button onClick={() => onAddCard(columnId)} style={{ marginBottom: 8 }}>
  + 카드
</button>
      {cards.map((card) => (
        <DraggableCard key={card.id} card={card} onRemove={onRemove}/>
      ))}


    </div>
  )
}