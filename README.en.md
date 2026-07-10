# realtime-kanban

A realtime collaborative kanban board built on Supabase Realtime broadcast.
A learning project focused on handling concurrent-edit conflicts with timestamp-based LWW (Last-Write-Wins),
and keeping the UI responsive with optimistic updates + rollback.

*Read this in other languages: [한국어](README.md)*

## Tech Stack

- Vite + React + TypeScript
- State: useReducer (normalized flat state)
- Realtime: Supabase Realtime (broadcast)
- Persistence: Supabase (Postgres)
- Drag & drop: dnd-kit

## Getting Started

```bash
npm install
npm run dev
```

Requires Supabase credentials in `.env`:

```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_KEY=your-anon-key
```

## Status

- [x] Realtime card-move sync via broadcast
- [x] Timestamp-based LWW conflict handling (stale events discarded)
- [x] Loading cards from Supabase (state survives refresh)
- [x] Card moves persisted to DB + rollback on failure
- [x] Add / remove cards
- [x] File structure split (reducer / components / hooks)
- [x] Reordering within a column
- [x] Deployed

## Design Notes

### 1. Why broadcast instead of Postgres Changes

Supabase offers two ways to do realtime sync: Postgres Changes (automatically propagates DB changes) and broadcast (clients send events directly).

With Postgres Changes, the code gets smaller — but conflict resolution is effectively delegated to the order of DB transactions. The goal of this project was to handle concurrent-edit conflicts myself. So I chose broadcast, which keeps conflict-resolution logic under the client's control.

I also looked at `realtime.broadcast_changes`, where a DB trigger publishes the broadcast. But that too propagates the final state as decided by the DB, so I ruled it out for the same reason.

The DB remains the single source of truth; broadcast is a means of reducing latency. This is also why the app loads state from the DB first on mount, and only then starts subscribing. Even if a broadcast event is lost, a refresh reconciles everything against the DB.

### 2. Rollback implemented as a reverse move, not a snapshot restore

Initially, the app captured a snapshot of the whole board when a drag started, and restored that snapshot if the save failed.

In a collaborative setting this breaks down. If it takes a few hundred milliseconds for A's save to fail, and B moves another card in the meantime, A's rollback reverts B's move as well. My failed save ends up clobbering another user's perfectly valid change.

So I changed the rollback to a "reverse move back to the original column and position." Only the affected card is reverted, so concurrent changes by others are preserved. I verified this behavior by forcing save failures across two browser tabs.

### 3. Card positions managed as float midpoints, not integer re-indexing

Each card carries a number (`position`) that determines its order. How you assign this number decides
"how many cards must be updated when one card moves."

**With integer ordering (0, 1, 2...).**
To insert a new card between #0 and #1, there is no number available for the slot.
So #1 becomes #2, #2 becomes #3... every following card must shift by one.
Moving a single card turns into a multi-row UPDATE, and if any one of them fails,
figuring out how far to roll back gets complicated.

**With midpoints.**
Keep `position` as a float (double precision), initially spaced out like 1000, 2000, 3000.
To insert between 1000 and 2000, just assign the midpoint: 1500. The neighbors stay
at 1000 and 2000. Sorting yields 1000 → 1500 → 2000.

In other words, **only the moved card needs an UPDATE.** No other card is touched.
As a result, move / add / reorder all share the same shape — "a single-row write" —
and when something fails, the rollback target is that one row, which keeps rollback simple.

**The trade-off is precision.** Repeatedly inserting into the same spot halves the gap
each time: 1500 → 1250 → 1125 → ... After a few dozen iterations you hit the limits
of what a float can represent. At this project's scale that doesn't happen,
so no mitigation was added.

### 4. Limitations of client-timestamp LWW

Conflicts are resolved with Last-Write-Wins. Each card carries updatedAt (epoch ms); an incoming event whose timestamp is not newer than the current value is judged stale and discarded.

This approach has several known limitations.

Clock skew — Timestamps are generated on the client, so a client with a fast clock always wins. Server-authoritative timestamps would fix this, but they hand conflict resolution back to the server — which contradicts the reason broadcast was chosen in note #1.

LWW does not apply to DB writes — Conflict adjudication happens only in the client reducer. The update query targets rows by id alone, so an earlier request can still overwrite a later change that has already been saved. The screens converge via LWW, but the DB ends up holding whichever write arrived last. Preventing this would require a conditional update on the server that includes updated_at in the condition (optimistic locking) — but that, too, hands conflict adjudication over to the server.

Not suitable for text editing — For card position, it's fine for one side to win and the other to lose under LWW. But if two users edit the same text field concurrently, the loser's input disappears entirely. That territory calls for field-level locking or CRDTs, which is beyond the scope of this project. This is also why card-title editing was deliberately left out.

Delete vs. move conflicts — Timestamp comparison is not applied to deletions.
If one user deletes a card while another moves the same card, the deletion wins
even if the move event happened later.
(The reducer ignores move events for cards that no longer exist.)
Handling this strictly would require tombstones — keeping a deletion marker and
comparing delete-time against move-time — which I judged to be outside this
project's scope and did not implement.

Most of these limitations are the price of placing conflict adjudication on the client.
Moving to a server-authoritative model would resolve them — but it would also dissolve
the very problem this project set out to explore.
For the specific problem of moving cards, I concluded client-side LWW is a reasonable fit.

## Demo

https://realtime-kanban-indol.vercel.app/

Open it in two tabs to see realtime sync in action.