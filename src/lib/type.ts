export type Card = {
  id: string;
  title: string;
  columnId: string;
  order: number;
  updatedAt: number;
};

export type BoardState = {
  cards: Record<string, Card>
  columnOrder: string[]
}