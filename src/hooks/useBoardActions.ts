import type { BoardState, Card } from "../lib/type";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { DragEndEvent } from "@dnd-kit/core";
import type { Action } from "../reducer/boardReducer";

export function useBoardActions(
  state: BoardState,
  dispatch: React.Dispatch<Action>,
  channelRef: React.RefObject<RealtimeChannel | null>,
) {
  const handleRemoveCard = async (cardId: string) => {
    const card = state.cards[cardId]; // ← 되살리기용, 지우기 전에 확보
    if (!card) return;

    // 1) 낙관적 제거 + 전파
    dispatch({ type: "REMOVE_CARD", cardId });
    channelRef.current?.send({
      type: "broadcast",
      event: "card-removed",
      payload: { cardId },
    });

    // 2) DB 삭제
    const { error } = await supabase.from("cards").delete().eq("id", cardId);

    // 3) 실패 → 되살림 (확보해둔 card로 복원)
    if (error) {
      console.error("remove failed", error);
      dispatch({ type: "ADD_CARD", card });
      channelRef.current?.send({
        type: "broadcast",
        event: "card-added",
        payload: { card },
      });
    }
  };
  const handleAddCard = async (columnId: string) => {
    const id = crypto.randomUUID(); // 클라이언트에서 id 생성 (낙관적 추가의 핵심)
    const now = Date.now();

    // 맨 뒤 order = 최댓값 + 1000 (이동과 동일 규칙)
    const columnCards = Object.values(state.cards).filter(
      (c) => c.columnId === columnId,
    );
    const order =
      (columnCards.length ? Math.max(...columnCards.map((c) => c.order)) : 0) +
      1000;

    const card: Card = {
      id,
      title: `새카드 ${columnCards.length + 1}`,
      columnId,
      order,
      updatedAt: now,
    };

    // 1) 낙관적 + 전파
    dispatch({ type: "ADD_CARD", card });
    channelRef.current?.send({
      type: "broadcast",
      event: "card-added",
      payload: { card },
    });

    // 2) DB 저장
    const { error } = await supabase.from("cards").insert({
      id,
      column_id: columnId,
      title: card.title,
      position: order,
      updated_at: now,
    });

    // 3) 실패 → 되돌림 (추가한 걸 도로 제거)
    if (error) {
      console.error("add failed", error);
      dispatch({ type: "REMOVE_CARD", cardId: id });
      channelRef.current?.send({
        type: "broadcast",
        event: "card-removed",
        payload: { cardId: id },
      });
    }
  };

function calcOrder(state: BoardState, toColumn: string, overCard: Card | undefined): number {
  const columnCards = Object.values(state.cards)
    .filter(c => c.columnId === toColumn)
    .sort((a, b) => a.order - b.order)

  // 경우 1: 카드가 아니라 컬럼에 떨어뜨림 → 맨 뒤
  if (!overCard) {
    return columnCards.length ? columnCards[columnCards.length - 1].order + 1000 : 1000
  }

  // 경우 2: overCard 앞자리
  const overIdx = columnCards.findIndex(c => c.id === overCard.id)
  const prevCard = columnCards[overIdx - 1]        // 앞 카드 (없으면 undefined)

  // 경우 3: 맨 위 (앞 카드 없음)
  if (!prevCard) return overCard.order - 1000

  // 앞뒤 중간값 ← float 중간값의 본무대
  return (prevCard.order + overCard.order) / 2
}

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return; // 컬럼 밖에 떨어뜨림

    const cardId = active.id as string;
    const overId = over.id as string;
    if (cardId === overId) return              // 자기 위에 떨어뜨림 → 무시

    const card = state.cards[cardId];
    const originalColumn = card.columnId;
    const originalOrder = card.order; // 롤백 시 원위치 복원용

    const overCard = state.cards[overId]
    const toColumn = overCard ? overCard.columnId : overId
    const newOrder = calcOrder(state, toColumn, overCard)

  // 컬럼도 같고 순서도 그대로면 무시
  if (toColumn === originalColumn && newOrder === originalOrder) return
    

    const now = Date.now();


    // 1) 낙관적: 로컬 + 전파 (동일 order를 실어 보냄)
    dispatch({
      type: "MOVE_CARD",
      cardId,
      toColumn,
      order: newOrder,
      updatedAt: now,
    });
    channelRef.current?.send({
      type: "broadcast",
      event: "card-moved",
      payload: { cardId, toColumn, order: newOrder, updatedAt: now },
    });

    // 2) DB에 한 행만 저장
    const { error } = await supabase
      .from("cards")
      .update({ column_id: toColumn, position: newOrder, updated_at: now })
      .eq("id", cardId);

    // 3) 실패 → 역방향 이동 (스냅샷 아님, 동시 이동 보존, 원위치 복원)
    if (error) {
      console.error("save failed", error);
      const rollBackNow = Date.now();
      dispatch({
        type: "MOVE_CARD",
        cardId,
        toColumn: originalColumn,
        order: originalOrder,
        updatedAt: rollBackNow,
      });
      
      channelRef.current?.send({
        type: "broadcast",
        event: "card-moved",
        payload: {
          cardId,
          toColumn: originalColumn,
          order: originalOrder,
          updatedAt: rollBackNow,
        },
      });
    }
  };
  return { handleRemoveCard, handleAddCard, handleDragEnd };
}
