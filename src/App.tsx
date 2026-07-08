import { useEffect, useReducer, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { type RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { BoardState, Card } from './lib/type'
import { loadCards } from './lib/card'
import { boardReducer, initialState } from './reducer/boardReducer'
import { DroppableColumn } from './components/DroppableColumn'

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

  const handleDragEnd = async(event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return // 컬럼 밖에 떨어뜨림
    const cardId = active.id as string
    const toColumn = over.id as string

    const card = state.cards[cardId]
    const originalColumn = card.columnId
    const originalOrder = card.order          // 롤백 시 원위치 복원용
    if (originalColumn === toColumn) return    // 같은 컬럼이면 무시 (재정렬은 스코프 2)


    const now = Date.now()

    // 대상 컬럼 맨 뒤 order = 최댓값 + 간격 (문제 1 해결). 한 번만 계산.
  const targetCards = Object.values(state.cards).filter(c => c.columnId === toColumn)
  const newOrder = (targetCards.length ? Math.max(...targetCards.map(c => c.order)) : 0) + 1000
   
  // 1) 낙관적: 로컬 + 전파 (동일 order를 실어 보냄)
  dispatch({ type: 'MOVE_CARD', cardId, toColumn, order: newOrder, updatedAt: now })
  channelRef.current?.send({
    type: 'broadcast', event: 'card-moved',
    payload: { cardId, toColumn, order: newOrder, updatedAt: now },
  })

//   const error = await new Promise<{ message: string }>((resolve) => {
//   setTimeout(() => resolve({ message: 'forced failure for testing' }), 3000)
// })



    // 2) DB에 한 행만 저장
  const { error } = await supabase
    .from('cards')
    .update({ column_id: toColumn, position: newOrder, updated_at: now })
    .eq('id', cardId)

// 3) 실패 → 역방향 이동 (스냅샷 아님, 동시 이동 보존, 원위치 복원)
  if (error) {
    console.error('save failed', error)
    const rollBackNow = Date.now()
    dispatch({ type: 'MOVE_CARD', cardId, toColumn: originalColumn, order: originalOrder, updatedAt: rollBackNow })
    channelRef.current?.send({
      type: 'broadcast', event: 'card-moved',
      payload: { cardId, toColumn: originalColumn, order: originalOrder, updatedAt: rollBackNow },
    })
  }


    
  }

  const handleAddCard = async (columnId: string) => {
  const id = crypto.randomUUID()              // 클라이언트에서 id 생성 (낙관적 추가의 핵심)
  const now = Date.now()

  // 맨 뒤 order = 최댓값 + 1000 (이동과 동일 규칙)
  const columnCards = Object.values(state.cards).filter(c => c.columnId === columnId)
  const order = (columnCards.length ? Math.max(...columnCards.map(c => c.order)) : 0) + 1000

  const card: Card = { id, title: `새카드 ${columnCards.length+1}`, columnId, order, updatedAt: now }

  // 1) 낙관적 + 전파
  dispatch({ type: 'ADD_CARD', card })
  channelRef.current?.send({ type: 'broadcast', event: 'card-added', payload: { card } })

  // 2) DB 저장
  const { error } = await supabase.from('cards').insert({
    id, column_id: columnId, title: card.title, position: order, updated_at: now,
  })

  // 3) 실패 → 되돌림 (추가한 걸 도로 제거)
  if (error) {
    console.error('add failed', error)
    dispatch({ type: 'REMOVE_CARD', cardId: id })
    channelRef.current?.send({ type: 'broadcast', event: 'card-removed', payload: { cardId: id } })
  }
}

const handleRemoveCard = async (cardId: string) => {
  const card = state.cards[cardId]        // ← 되살리기용, 지우기 전에 확보
  if (!card) return

  // 1) 낙관적 제거 + 전파
  dispatch({ type: 'REMOVE_CARD', cardId })
  channelRef.current?.send({ type: 'broadcast', event: 'card-removed', payload: { cardId } })

  // 2) DB 삭제
  const { error } = await supabase.from('cards').delete().eq('id', cardId)

  // 3) 실패 → 되살림 (확보해둔 card로 복원)
  if (error) {
    console.error('remove failed', error)
    dispatch({ type: 'ADD_CARD', card })
    channelRef.current?.send({ type: 'broadcast', event: 'card-added', payload: { card } })
  }
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