const initialState = {
  cards: {
    c1: { id: 'c1', title: '기획서 작성', columnId: 'todo', order: 0 },
    c2: { id: 'c2', title: 'API 설계', columnId: 'todo', order: 1 },
    c3: { id: 'c3', title: '로그인 구현', columnId: 'doing', order: 0 },
    c4: { id: 'c4', title: '배포 세팅', columnId: 'done', order: 0 },
  },
  columnOrder: ['todo', 'doing', 'done'],
}

console.log(Object.keys(initialState.cards))