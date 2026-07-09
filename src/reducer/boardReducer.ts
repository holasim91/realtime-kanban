import type { BoardState, Card } from "../lib/type";

export const initialState: BoardState = {
  cards: {},
  columnOrder: ["todo", "doing", "done"],
};

export type Action =
  | {
      type: "MOVE_CARD";
      cardId: string;
      toColumn: string;
      order: number;
      updatedAt: number;
    }
  | { type: "HYDRATE"; cards: Record<string, Card> }
  | { type: "ADD_CARD"; card: Card }
  | { type: "REMOVE_CARD"; cardId: string };

export function boardReducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case "MOVE_CARD": {
      const card = state.cards[action.cardId];
      if (!card) return state;
      if (card.updatedAt >= action.updatedAt) return state; // LWW만
      const newCard = {
        ...card,
        columnId: action.toColumn,
        order: action.order,
        updatedAt: action.updatedAt,
      };
      return { ...state, cards: { ...state.cards, [action.cardId]: newCard } };
    }
    case "HYDRATE":
      return { ...state, cards: action.cards };

    case "ADD_CARD":
      return {
        ...state,
        cards: { ...state.cards, [action.card.id]: action.card },
      };

    case "REMOVE_CARD": {
      const rest = { ...state.cards };
      delete rest[action.cardId];
      return { ...state, cards: rest };
    }
    default:
      return state;
  }
}
