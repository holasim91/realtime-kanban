import { useEffect, useReducer, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { type RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Card } from './lib/type'
import { loadCards } from './lib/card'

// ── 데이터 구조 (옵션 2: flat) ──────────────────────────────
type BoardState = {
  cards: Record<string, Card>
  columnOrder: string[]
}

const initialState: BoardState = {
  cards: {},
  columnOrder: ['todo', 'doing', 'done'],
}

// ── reducer ─────────────────────────────────────────────────
type Action = 
  | { type: 'MOVE_CARD'; cardId: string; toColumn: string, updatedAt:number} 
  |  { type: 'ROLLBACK'; prevState:BoardState }
   | { type: 'HYDRATE'; cards: Record<string, Card> }  

function boardReducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case 'MOVE_CARD': {
      const originalColumnId = state.cards[action.cardId].columnId
      const originalUpdatedAt = state.cards[action.cardId].updatedAt
      if(originalColumnId === action.toColumn || originalUpdatedAt >= action.updatedAt){
        return state
      }else{
        const taregetOrder = Object.values(state.cards).filter(c => c.columnId === action.toColumn).length || 0
        const newCard = {...state.cards[action.cardId], columnId:action.toColumn, order: taregetOrder, updatedAt:action.updatedAt}
        let _cards = {...state.cards, [action.cardId]:newCard}

        const remaining = Object.values(_cards).filter((c) => c.columnId === originalColumnId).sort((a, b) => a.order - b.order)
        remaining.forEach((r,idx) =>{
                    const orderArrangedCard = {...r, order:idx}
          _cards = {..._cards, [r.id]:orderArrangedCard}

        })
        return {...state, cards: _cards}
      }
    
    }
    case 'HYDRATE':
      return { ...state, cards: action.cards }
    default:
      return state
  }
  
}

// ── 컬럼별 카드 골라 정렬 (함정 2 대응, 파생 데이터) ──────────
function getCardsByColumn(state: BoardState, columnId: string): Card[] {
  return Object.values(state.cards)
    .filter((c) => c.columnId === columnId)
    .sort((a, b) => a.order - b.order)
}

// ── 드래그 가능한 카드 ──────────────────────────────────────
function DraggableCard({ card }: { card: Card }) {
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
    </div>
  )
}

// ── 드롭 가능한 컬럼 ────────────────────────────────────────
function DroppableColumn({
  columnId,
  cards,
}: {
  columnId: string
  cards: Card[]
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
      {cards.map((card) => (
        <DraggableCard key={card.id} card={card} />
      ))}
    </div>
  )
}




function fakeSave() {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.5) {
        resolve()      // 성공
      } else {
        reject(new Error('save failed'))       // 실패
      }
    }, 500)
  })
}


// ── 메인 ────────────────────────────────────────────────────
function App() {
  const [state, dispatch] = useReducer(boardReducer, initialState)
  const sensors = useSensors(useSensor(PointerSensor))

  const channelRef = useRef<RealtimeChannel | null>(null)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return // 컬럼 밖에 떨어뜨림
    const cardId = active.id as string
    const toColumn = over.id as string
    const prevState = state // 옮기기 전 상태
    const now = Date.now()
   
    dispatch({ type: 'MOVE_CARD', cardId, toColumn, updatedAt:now })
    channelRef.current?.send({
      type: 'broadcast',
      event: 'card-moved',
      payload: { cardId, toColumn, updatedAt:now },
})

 fakeSave().catch((e)=>{
      console.error(e)
      const originalColumn = prevState.cards[cardId].columnId
      const rollBackNow = Date.now()
      channelRef.current?.send({
      type: 'broadcast',
      event: 'card-moved',
      payload: { cardId, toColumn: originalColumn, updatedAt:rollBackNow  },
})
      dispatch({type:'ROLLBACK', prevState})

    }
    )
  }

 useEffect(() => {
  let channel: RealtimeChannel | null = null
  let cancelled = false

  const init = async () => {
    // 1) DB에서 먼저 로드 (DB가 진실원)
    try {
      const cards = await loadCards()
      if (!cancelled) dispatch({ type: 'HYDRATE', cards })
    } catch (e) {
      console.error('load failed', e)
    }
    if (cancelled) return

    // 2) 로드 끝난 뒤 broadcast 구독
    channel = supabase
      .channel('board-1')
      .on('broadcast', { event: 'card-moved' }, (payload) => {
        const { cardId, toColumn, updatedAt } = payload.payload
        dispatch({ type: 'MOVE_CARD', cardId, toColumn, updatedAt })
      })
      .subscribe((status) => {
        console.log('구독 상태:', status)
      })

    channelRef.current = channel
  }

  init()

  return () => {
    cancelled = true
    if (channel) supabase.removeChannel(channel)
  }
}, [])



  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div style={{ display: 'flex', gap: 16, padding: 40 }}>
        {state.columnOrder.map((columnId) => (
          <DroppableColumn
            key={columnId}
            columnId={columnId}
            cards={getCardsByColumn(state, columnId)}
          />
        ))}
      </div>
    </DndContext>
  )
}

export default App