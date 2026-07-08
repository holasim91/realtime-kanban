import { useEffect, useReducer, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { type RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { BoardState, Card } from './lib/type'
import { loadCards } from './lib/card'
import { boardReducer, initialState } from './reducer/boardReducer'
import { DroppableColumn } from './components/DroppableColumn'
import { useBoardActions } from './hooks/useBoardActions'

// ── 컬럼별 카드 골라 정렬 (함정 2 대응, 파생 데이터) ──────────
function getCardsByColumn(state: BoardState, columnId: string): Card[] {
  return Object.values(state.cards)
    .filter((c) => c.columnId === columnId)
    .sort((a, b) => a.order - b.order)
}



// ── 메인 ────────────────────────────────────────────────────
function App() {
  const [state, dispatch] = useReducer(boardReducer, initialState)
  const sensors = useSensors(useSensor(PointerSensor))

  const channelRef = useRef<RealtimeChannel | null>(null)


const { handleAddCard, handleRemoveCard, handleDragEnd } = useBoardActions(state, dispatch, channelRef)
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
        const { cardId, toColumn, updatedAt, order } = payload.payload
        dispatch({ type: 'MOVE_CARD', cardId, toColumn, order, updatedAt })
      })
      .on('broadcast', { event: 'card-added' }, (payload) => {
      dispatch({ type: 'ADD_CARD', card: payload.payload.card })
      })
      .on('broadcast', { event: 'card-removed' }, (payload) => {
      dispatch({ type: 'REMOVE_CARD', cardId: payload.payload.cardId })
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
            onAddCard={handleAddCard}     
            onRemove={handleRemoveCard}
          />
          
        ))}

        
      </div>
    </DndContext>
  )
}

export default App