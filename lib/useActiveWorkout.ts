"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  abandonInProgressSession,
  completeWorkoutSession,
  createWorkoutSession,
  deleteSessionExercise,
  deleteWorkoutSession,
  getLastCompletedSessionCards,
  getWorkoutSessionForDate,
  isWorkoutSessionCompleted,
  loadSessionCards,
  persistCardOrder,
  upsertSessionExercise,
} from "@/lib/queries";
import { formatLocaleNumber, parseLocaleNumber, parseRunNote } from "@/lib/utils";
import type { WorkoutCardDraft } from "@/types/database";

const DEBOUNCE_MS = 1500;
const DRAFT_PREFIX = "liftmaxxing:draft:";

function formatUnknownError(err: unknown): string {
  if (err && typeof err === "object") {
    const o = err as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const parts: string[] = [];
    if (typeof o.message === "string" && o.message) parts.push(o.message);
    if (typeof o.code === "string" && o.code) parts.push(`code=${o.code}`);
    if (typeof o.details === "string" && o.details) parts.push(o.details);
    if (typeof o.hint === "string" && o.hint) parts.push(o.hint);
    if (parts.length > 0) return parts.join(" · ");
    try {
      return JSON.stringify(err);
    } catch {
      return "[unserializable error]";
    }
  }
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type DraftPayload = {
  cards: WorkoutCardDraft[];
  updatedAt: number;
};

function draftKey(sessionId: string) {
  return `${DRAFT_PREFIX}${sessionId}`;
}

function readDraft(sessionId: string): DraftPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as DraftPayload;
  } catch {
    return null;
  }
}

function writeDraft(sessionId: string, cards: WorkoutCardDraft[]) {
  if (typeof window === "undefined") return;
  const payload: DraftPayload = { cards, updatedAt: Date.now() };
  localStorage.setItem(draftKey(sessionId), JSON.stringify(payload));
}

function clearDraft(sessionId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(draftKey(sessionId));
}

/** A template slot keeps its slot id; a saved extra exercise adopts its DB row
 *  id. Until the first save an extra exercise only has its local random id. */
function canonicalizeCard(card: WorkoutCardDraft): WorkoutCardDraft {
  const cardId = card.slotId ?? card.sessionExerciseId ?? card.cardId;
  return cardId === card.cardId ? card : { ...card, cardId };
}

/** Drafts and server rows can disagree on cardId, so fall back to the other
 *  identities before treating two copies as different exercises. */
function isSameCard(a: WorkoutCardDraft, b: WorkoutCardDraft): boolean {
  if (a.cardId === b.cardId) return true;
  if (a.sessionExerciseId && a.sessionExerciseId === b.sessionExerciseId) {
    return true;
  }
  if (b.sessionExerciseId && a.cardId === b.sessionExerciseId) return true;
  if (a.sessionExerciseId && a.sessionExerciseId === b.cardId) return true;
  if (a.slotId && a.slotId === b.slotId) return true;
  // A movement is logged at most once per session, so an unslotted card with
  // the same movement is the same exercise carrying a stale draft id.
  if (!a.slotId && !b.slotId && a.performedMovementId === b.performedMovementId) {
    return true;
  }
  return false;
}

function cardHasValidSet(card: WorkoutCardDraft) {
  return card.sets.some((s) => s.weight_kg !== "" && s.reps !== "");
}

/** Fold duplicate copies of one exercise into a single card. */
function dedupeCards(cards: WorkoutCardDraft[]): WorkoutCardDraft[] {
  const out: WorkoutCardDraft[] = [];

  for (const card of cards) {
    const index = out.findIndex((c) => isSameCard(c, card));
    if (index < 0) {
      out.push(canonicalizeCard(card));
      continue;
    }

    const kept = out[index];
    const preferIncoming = !cardHasValidSet(kept) && cardHasValidSet(card);
    const base = preferIncoming ? card : kept;
    out[index] = canonicalizeCard({
      ...base,
      sessionExerciseId: kept.sessionExerciseId ?? card.sessionExerciseId,
    });
  }

  return out;
}

function mergeCards(
  dbCards: WorkoutCardDraft[],
  draftCards: WorkoutCardDraft[]
): WorkoutCardDraft[] {
  if (draftCards.length === 0) return dedupeCards(dbCards);
  if (dbCards.length === 0) return dedupeCards(draftCards);

  const remaining = [...dbCards];
  const merged: WorkoutCardDraft[] = [];

  for (const draft of draftCards) {
    const index = remaining.findIndex((db) => isSameCard(db, draft));
    if (index < 0) {
      merged.push(draft);
      continue;
    }

    const [db] = remaining.splice(index, 1);
    merged.push({
      ...db,
      ...draft,
      sessionExerciseId: db.sessionExerciseId ?? draft.sessionExerciseId,
    });
  }

  merged.push(...remaining);
  return dedupeCards(merged);
}

/** Once a card adopts its DB id, move any queued save over to the new key. */
function rekeyPendingSave(
  from: string,
  to: string,
  timers: Map<string, ReturnType<typeof setTimeout>>,
  pending: Set<string>
) {
  if (from === to) return;
  const timer = timers.get(from);
  if (timer) {
    timers.delete(from);
    timers.set(to, timer);
  }
  if (pending.delete(from)) pending.add(to);
}

type UseActiveWorkoutOptions = {
  splitId: string;
  workoutDate: string;
  buildInitialCards: () => WorkoutCardDraft[];
  templateReady: boolean;
};

export function useActiveWorkout({
  splitId,
  workoutDate,
  buildInitialCards,
  templateReady,
}: UseActiveWorkoutOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cards, setCards] = useState<WorkoutCardDraft[]>([]);
  const [cardsReady, setCardsReady] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [hasPendingSave, setHasPendingSave] = useState(false);

  const cardsRef = useRef(cards);
  const sessionIdRef = useRef(sessionId);
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingCards = useRef<Set<string>>(new Set());
  const saveStatusRef = useRef(saveStatus);
  const initStarted = useRef(false);
  const initKey = useRef("");

  cardsRef.current = cards;
  sessionIdRef.current = sessionId;
  saveStatusRef.current = saveStatus;

  const updatePendingState = useCallback(() => {
    setHasPendingSave(pendingCards.current.size > 0);
  }, []);

  const saveCard = useCallback(
    async (cardId: string) => {
      const sid = sessionIdRef.current;
      if (!sid) return;

      const card = cardsRef.current.find((c) => c.cardId === cardId);
      if (!card) return;

      const index = cardsRef.current.findIndex((c) => c.cardId === cardId);
      if (index < 0) return;

      if (!cardHasValidSet(card)) {
        pendingCards.current.delete(cardId);
        updatePendingState();
        return;
      }

      setSaveStatus("saving");
      try {
        const sessionExerciseId = await upsertSessionExercise(sid, card, index + 1);
        const nextCardId = card.slotId ?? sessionExerciseId ?? cardId;

        setCards((prev) => {
          const next = prev.map((c) =>
            c.cardId === cardId
              ? { ...c, sessionExerciseId, cardId: nextCardId }
              : c
          );
          cardsRef.current = next;
          return next;
        });
        writeDraft(sid, cardsRef.current);

        rekeyPendingSave(
          cardId,
          nextCardId,
          debounceTimers.current,
          pendingCards.current
        );
        if (!debounceTimers.current.has(nextCardId)) {
          pendingCards.current.delete(nextCardId);
        }
        updatePendingState();
        setSaveStatus("saved");
      } catch {
        pendingCards.current.delete(cardId);
        updatePendingState();
        setSaveStatus("error");
      }
    },
    [updatePendingState]
  );

  const scheduleCardSave = useCallback(
    (cardId: string) => {
      const sid = sessionIdRef.current;
      if (!sid) return;

      writeDraft(sid, cardsRef.current);

      const existing = debounceTimers.current.get(cardId);
      if (existing) clearTimeout(existing);

      pendingCards.current.add(cardId);
      updatePendingState();

      const timer = setTimeout(() => {
        debounceTimers.current.delete(cardId);
        void saveCard(cardId);
      }, DEBOUNCE_MS);
      debounceTimers.current.set(cardId, timer);
    },
    [saveCard, updatePendingState]
  );

  const retryFailedSaves = useCallback(() => {
    for (const card of cardsRef.current) {
      if (cardHasValidSet(card)) {
        pendingCards.current.add(card.cardId);
        void saveCard(card.cardId);
      }
    }
    updatePendingState();
  }, [saveCard, updatePendingState]);

  const flushSaves = useCallback(async () => {
    for (const timer of debounceTimers.current.values()) {
      clearTimeout(timer);
    }
    debounceTimers.current.clear();
    pendingCards.current.clear();
    updatePendingState();

    const sid = sessionIdRef.current;
    if (!sid) return;

    for (const card of [...cardsRef.current]) {
      if (!cardHasValidSet(card)) continue;

      const index = cardsRef.current.findIndex((c) => c.cardId === card.cardId);
      const current = cardsRef.current[index];
      if (!current) continue;

      try {
        const sessionExerciseId = await upsertSessionExercise(
          sid,
          current,
          index + 1
        );
        if (sessionExerciseId) {
          const nextCardId = current.slotId ?? sessionExerciseId;
          cardsRef.current = cardsRef.current.map((c) =>
            c.cardId === card.cardId
              ? { ...c, sessionExerciseId, cardId: nextCardId }
              : c
          );
        }
      } catch (err) {
        throw new Error(
          `${formatUnknownError(err)} (${current.performedName})`
        );
      }
    }

    setCards([...cardsRef.current]);
    if (sid) writeDraft(sid, cardsRef.current);
  }, [updatePendingState]);

  useEffect(() => {
    if (!templateReady) return;
    const key = `${splitId}:${workoutDate}`;
    if (initStarted.current && initKey.current === key) return;
    initStarted.current = true;
    initKey.current = key;

    (async () => {
      try {
        const sessionForDate = await getWorkoutSessionForDate(workoutDate);
        let sid: string;
        let resumed = false;
        let loaded: WorkoutCardDraft[] = [];

        if (sessionForDate) {
          sid = sessionForDate.id;
          resumed = true;
          loaded = await loadSessionCards(sid);
        } else {
          const session = await createWorkoutSession(splitId, workoutDate);
          sid = session.id;
          const lastLayout = await getLastCompletedSessionCards(splitId);
          if (lastLayout.length > 0) {
            loaded = lastLayout;
          }
        }

        setSessionId(sid);
        setIsResuming(resumed);

        const isCompleted = !!sessionForDate?.completed_at;
        if (isCompleted) {
          clearDraft(sid);
        }

        const draft = isCompleted ? null : readDraft(sid);
        const base = loaded.length > 0 ? loaded : buildInitialCards();
        const initial = mergeCards(base, draft?.cards ?? []);

        setCards(initial);
        setCardsReady(true);
        writeDraft(sid, initial);
      } catch {
        setSaveStatus("error");
        setCards(buildInitialCards());
        setCardsReady(true);
      }
    })();
  }, [splitId, workoutDate, templateReady, buildInitialCards]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingCards.current.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (pendingCards.current.size > 0 || saveStatusRef.current === "error") {
        retryFailedSaves();
      }
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [retryFailedSaves]);

  useEffect(() => {
    return () => {
      for (const timer of debounceTimers.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const updateCard = useCallback(
    (cardId: string, draft: WorkoutCardDraft) => {
      setCards((prev) => {
        const next = prev.map((c) => (c.cardId === cardId ? draft : c));
        if (sessionIdRef.current) writeDraft(sessionIdRef.current, next);
        return next;
      });
      scheduleCardSave(cardId);
    },
    [scheduleCardSave]
  );

  const removeCard = useCallback(
    async (cardId: string) => {
      const card = cardsRef.current.find((c) => c.cardId === cardId);
      const timer = debounceTimers.current.get(cardId);
      if (timer) {
        clearTimeout(timer);
        debounceTimers.current.delete(cardId);
      }
      pendingCards.current.delete(cardId);
      updatePendingState();

      if (card?.sessionExerciseId) {
        try {
          await deleteSessionExercise(card.sessionExerciseId);
        } catch {
          setSaveStatus("error");
        }
      }

      const next = cardsRef.current.filter((c) => c.cardId !== cardId);
      cardsRef.current = next;
      setCards(next);

      const sid = sessionIdRef.current;
      if (!sid) return;

      writeDraft(sid, next);
      try {
        const ordered = await persistCardOrder(sid, next);
        cardsRef.current = ordered;
        setCards(ordered);
        writeDraft(sid, ordered);
      } catch {
        setSaveStatus("error");
      }
    },
    [updatePendingState]
  );

  const addCard = useCallback((draft: WorkoutCardDraft) => {
    setCards((prev) => {
      // One row per movement per session, so re-adding is a no-op.
      if (prev.some((c) => isSameCard(c, draft))) return prev;
      const next = [...prev, draft];
      if (sessionIdRef.current) writeDraft(sessionIdRef.current, next);
      return next;
    });
  }, []);

  const moveCard = useCallback(async (cardId: string, direction: "up" | "down") => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    const prev = cardsRef.current;
    const index = prev.findIndex((c) => c.cardId === cardId);
    if (index < 0) return;

    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= prev.length) return;

    const next = [...prev];
    [next[index], next[target]] = [next[target], next[index]];
    cardsRef.current = next;
    setCards(next);
    writeDraft(sid, next);

    try {
      const ordered = await persistCardOrder(sid, next);
      cardsRef.current = ordered;
      setCards(ordered);
      writeDraft(sid, ordered);
    } catch {
      setSaveStatus("error");
    }
  }, []);

  const canMoveUp = useCallback(
    (cardId: string) => {
      const index = cards.findIndex((c) => c.cardId === cardId);
      return index > 0;
    },
    [cards]
  );

  const canMoveDown = useCallback(
    (cardId: string) => {
      const index = cards.findIndex((c) => c.cardId === cardId);
      return index >= 0 && index < cards.length - 1;
    },
    [cards]
  );

  const startFresh = useCallback(async () => {
    await flushSaves();
    if (sessionIdRef.current) clearDraft(sessionIdRef.current);
    await abandonInProgressSession(splitId, workoutDate);
    const session = await createWorkoutSession(splitId, workoutDate);
    const lastLayout = await getLastCompletedSessionCards(splitId);
    const initial = lastLayout.length > 0 ? lastLayout : buildInitialCards();
    setSessionId(session.id);
    setIsResuming(false);
    setCards(initial);
    writeDraft(session.id, initial);
    setSaveStatus("idle");
  }, [splitId, workoutDate, buildInitialCards, flushSaves]);

  const finishWorkout = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) {
      throw new Error("No active session. Reload and try again.");
    }

    try {
      if (await isWorkoutSessionCompleted(sid)) {
        clearDraft(sid);
        return;
      }

      await flushSaves();
    } catch (err) {
      throw new Error(`Save failed before finish: ${formatUnknownError(err)}`);
    }

    let ordered: WorkoutCardDraft[];
    try {
      ordered = await persistCardOrder(sid, cardsRef.current);
    } catch (err) {
      throw new Error(
        `Could not save exercise order: ${formatUnknownError(err)}`
      );
    }

    cardsRef.current = ordered;
    setCards(ordered);

    try {
      await completeWorkoutSession(sid);
    } catch (err) {
      throw new Error(
        `Could not mark workout complete: ${formatUnknownError(err)}`
      );
    }

    clearDraft(sid);
  }, [flushSaves]);

  const deleteWorkout = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    await flushSaves();
    await deleteWorkoutSession(sid);
    clearDraft(sid);
  }, [flushSaves]);

  const hasSavedSets = cards.some(cardHasValidSet);

  return {
    sessionId,
    cards,
    cardsReady,
    isResuming,
    saveStatus,
    hasPendingSave,
    hasSavedSets,
    updateCard,
    removeCard,
    addCard,
    moveCard,
    canMoveUp,
    canMoveDown,
    startFresh,
    finishWorkout,
    deleteWorkout,
  };
}

export function useRunAutosave({
  splitId,
  workoutDate,
  slotId,
  movementId,
  movementName,
  targetMuscle,
  duration,
  distance,
  speed,
  elevation,
  note,
  buildNote,
  templateReady,
}: {
  splitId: string;
  workoutDate: string;
  slotId: string | null;
  movementId: string;
  movementName: string;
  targetMuscle: string;
  duration: string;
  distance: string;
  speed: string;
  elevation: string;
  note: string;
  buildNote: () => string | null;
  templateReady: boolean;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionExerciseId, setSessionExerciseId] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [hasPendingSave, setHasPendingSave] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(sessionId);
  const sessionExerciseIdRef = useRef(sessionExerciseId);
  const saveStatusRef = useRef(saveStatus);
  const initStarted = useRef(false);
  const initKey = useRef("");

  sessionIdRef.current = sessionId;
  sessionExerciseIdRef.current = sessionExerciseId;
  saveStatusRef.current = saveStatus;

  const buildRunDraft = useCallback((): WorkoutCardDraft | null => {
    const durationMin = duration.trim() ? parseLocaleNumber(duration) : null;
    if (durationMin == null || durationMin <= 0 || !movementId) return null;

    const parsedDist = distance.trim() ? parseLocaleNumber(distance) : null;
    const distanceKm = parsedDist != null && parsedDist > 0 ? parsedDist : 0;
    return {
      cardId: slotId ?? "run",
      slotId,
      sessionExerciseId: sessionExerciseIdRef.current,
      performedMovementId: movementId,
      performedName: movementName,
      targetMuscle,
      sets: [{ weight_kg: String(distanceKm), reps: String(durationMin) }],
      note: buildNote() ?? "",
    };
  }, [
    duration,
    distance,
    movementId,
    movementName,
    targetMuscle,
    slotId,
    buildNote,
  ]);

  const saveRun = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    const draft = buildRunDraft();
    if (!draft) {
      setHasPendingSave(false);
      return;
    }

    setSaveStatus("saving");
    try {
      const id = await upsertSessionExercise(sid, draft, 1);
      if (id) setSessionExerciseId(id);
      setHasPendingSave(false);
      setSaveStatus("saved");
    } catch {
      setHasPendingSave(false);
      setSaveStatus("error");
    }
  }, [buildRunDraft]);

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setHasPendingSave(true);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void saveRun();
    }, DEBOUNCE_MS);
  }, [saveRun]);

  const flushSave = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await saveRun();
  }, [saveRun]);

  const [resumeData, setResumeData] = useState<{
    duration: string;
    distance: string;
    speed: string;
    elevation: string;
    note: string;
    movementId: string;
  } | null>(null);

  useEffect(() => {
    if (!templateReady || !movementId) return;
    const key = `${splitId}:${workoutDate}:${movementId}`;
    if (initStarted.current && initKey.current === key) return;
    initStarted.current = true;
    initKey.current = key;

    (async () => {
      try {
        const sessionForDate = await getWorkoutSessionForDate(workoutDate);
        let sid: string;

        if (sessionForDate) {
          sid = sessionForDate.id;
          setIsResuming(true);
          const cards = await loadSessionCards(sid);
          const runCard = cards[0];
          if (runCard?.sessionExerciseId) {
            setSessionExerciseId(runCard.sessionExerciseId);
          }
          if (runCard?.sets[0]) {
            const parsed = parseRunNote(runCard.note);
            const dist = parseLocaleNumber(runCard.sets[0].weight_kg);
            const dur = parseLocaleNumber(runCard.sets[0].reps);
            setResumeData({
              duration:
                dur != null && dur > 0
                  ? formatLocaleNumber(dur, 1)
                  : runCard.sets[0].reps,
              distance:
                dist != null && dist > 0
                  ? formatLocaleNumber(dist, 2)
                  : "",
              speed: parsed.speed,
              elevation: parsed.elevation,
              note: parsed.userNote,
              movementId: runCard.performedMovementId,
            });
          }
        } else {
          const session = await createWorkoutSession(splitId, workoutDate);
          sid = session.id;
        }

        setSessionId(sid);
        setReady(true);
      } catch {
        setSaveStatus("error");
        setReady(true);
      }
    })();
  }, [splitId, workoutDate, templateReady, movementId]);

  useEffect(() => {
    if (!ready || !sessionId) return;
    scheduleSave();
  }, [duration, distance, speed, elevation, note, movementId, ready, sessionId, scheduleSave]);

  useEffect(() => {
    const handler = () => {
      if (
        hasPendingSave ||
        saveStatusRef.current === "error" ||
        debounceRef.current
      ) {
        void saveRun();
      }
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [hasPendingSave, saveRun]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasPendingSave) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasPendingSave]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const finishRun = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    await flushSave();
    await completeWorkoutSession(sid);
  }, [flushSave]);

  const deleteRun = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    await flushSave();
    await deleteWorkoutSession(sid);
  }, [flushSave]);

  const parsedDuration = parseLocaleNumber(duration);
  const canFinish = parsedDuration != null && parsedDuration > 0;

  return {
    sessionId,
    isResuming,
    ready,
    saveStatus,
    hasPendingSave,
    canFinish,
    finishRun,
    deleteRun,
    resumeData,
  };
}
