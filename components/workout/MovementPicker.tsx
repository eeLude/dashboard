"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { getOrCreateMovement } from "@/lib/queries";
import type { Movement } from "@/types/database";

function guessMuscleGroup(name: string, availableGroups: string[]): string | null {
  const lower = name.toLowerCase();
  const rules: [RegExp, string][] = [
    [/tricep|skull\s*crush|katana|pushdown|\bdip\b/i, "Triceps"],
    [/bicep|curl|preacher/i, "Biceps"],
    [/rear\s*delt|face\s*pull/i, "Rear Delts"],
    [/lateral|shoulder|arnold|overhead\s*press|military/i, "Shoulders"],
    [/bench|chest|fly|pec|push-?up/i, "Chest"],
    [/lat\b|pulldown|pull-?up|chin-?up|row|back\s*ext|t-bar/i, "Back"],
    [/squat|lunge|leg\s*ext|leg\s*press|hack/i, "Quads"],
    [/hamstring|rdl|deadlift|hip\s*thrust/i, "Hamstrings"],
    [/calf|calves/i, "Calves"],
    [/ab\b|crunch|core|leg\s*raise|plank/i, "Core"],
  ];
  for (const [regex, muscle] of rules) {
    if (regex.test(lower) && availableGroups.includes(muscle)) {
      return muscle;
    }
  }
  return null;
}

export function MovementPicker({
  movements,
  muscleGroups,
  onSelect,
  onClose,
}: {
  movements: Movement[];
  muscleGroups: string[];
  onSelect: (movement: Movement) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [targetMuscle, setTargetMuscle] = useState(muscleGroups[0] ?? "Chest");
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const guessed = guessMuscleGroup(search, muscleGroups);
    if (guessed) {
      setTargetMuscle(guessed);
    } else if (muscleGroups.length > 0 && !muscleGroups.includes(targetMuscle)) {
      setTargetMuscle(muscleGroups[0]);
    }
  }, [search, muscleGroups, targetMuscle]);

  const trimmedSearch = search.trim();
  const hasExactMatch = useMemo(
    () =>
      trimmedSearch.length > 0 &&
      movements.some(
        (m) => m.name.toLowerCase() === trimmedSearch.toLowerCase()
      ),
    [movements, trimmedSearch]
  );
  const showCreate = trimmedSearch.length > 0 && !hasExactMatch;

  const createMutation = useMutation({
    mutationFn: () => getOrCreateMovement(trimmedSearch, targetMuscle),
    onSuccess: async (movement) => {
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
      onSelect(movement);
    },
    onError: (error) => {
      setCreateError(
        error instanceof Error ? error.message : "Could not add exercise"
      );
    },
  });

  const filtered = movements.filter((m) => {
    const q = trimmedSearch.toLowerCase();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.target_muscle.toLowerCase().includes(q)
    );
  });

  const grouped = filtered.reduce<Map<string, Movement[]>>((map, m) => {
    const group = map.get(m.target_muscle) ?? [];
    group.push(m);
    map.set(m.target_muscle, group);
    return map;
  }, new Map());

  const sortedGroups = [...grouped.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-200">Add exercise</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-500 hover:text-zinc-300"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        type="search"
        placeholder="Search movements..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setCreateError(null);
        }}
        className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
      />
      <div className="max-h-64 space-y-3 overflow-y-auto">
        {sortedGroups.map(([muscle, items]) => (
          <div key={muscle}>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              {muscle}
            </p>
            <div className="space-y-1">
              {items.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect(m)}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && !showCreate && (
          <p className="text-sm text-zinc-500">No movements found.</p>
        )}
      </div>

      {showCreate && (
        <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
          <p className="text-sm text-zinc-400">
            Add &ldquo;{trimmedSearch}&rdquo; to your catalog
          </p>
          <select
            value={targetMuscle}
            onChange={(e) => setTargetMuscle(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
          >
            {muscleGroups.map((muscle) => (
              <option key={muscle} value={muscle}>
                {muscle}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              createMutation.mutate();
            }}
            disabled={createMutation.isPending || muscleGroups.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {createMutation.isPending ? "Adding..." : `Add "${trimmedSearch}"`}
          </button>
          {createError && (
            <p className="text-sm text-red-400">{createError}</p>
          )}
        </div>
      )}
    </div>
  );
}
