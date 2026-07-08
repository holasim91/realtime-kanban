# realtime-kanban

Supabase Realtime broadcast 기반 실시간 협업 칸반보드.
타임스탬프 기반 LWW(Last-Write-Wins)로 동시 편집 충돌을 처리하고,
낙관적 업데이트 + 롤백으로 반응성을 확보하는 것을 목표로 한 학습 프로젝트.

## 기술 스택

- Vite + React + TypeScript
- 상태: useReducer (정규화된 flat 상태)
- 실시간: Supabase Realtime (broadcast)
- 영속화: Supabase (Postgres)
- 드래그: dnd-kit

## 실행

\```bash
npm install
npm run dev
\```

`.env`에 Supabase 값 필요:

\```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_KEY=your-anon-key
\```

## 현재 상태

- [x] broadcast 기반 실시간 카드 이동 동기화
- [x] 타임스탬프 LWW 충돌 처리 (오래된 이벤트 폐기)
- [x] Supabase에서 카드 로드 (새로고침 후 유지)
- [x] 카드 이동 DB 영속화 + 롤백
- [ ] 카드 추가 / 삭제
- [ ] 컬럼 내 순서 변경
- [ ] 배포

## 설계 노트

(기능 확정 후 작성 예정 — 왜 broadcast + 수동 LWW인지,
DB를 진실원으로 두고 broadcast를 최적화로 쓰는 구조 등)