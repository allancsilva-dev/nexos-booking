"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { WorkingHoursInput } from "@nexos/shared";
import { ApiError } from "@/lib/http-client";
import { extractFieldErrors, formatGlobalError } from "@/lib/error-handler";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/loading-state";
import {
  OperationalPanel,
  OperationalPanelContent,
} from "@/components/ui/operational/panel";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
// Ordem de exibição: começa na segunda, domingo por último.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface BlockDraft {
  startTime: string;
  endTime: string;
}

interface DayDraft {
  weekday: number;
  blocks: BlockDraft[];
}

interface PatternDraft {
  selectedWeekdays: number[];
  startTime: string;
  endTime: string;
  hasLunch: boolean;
  lunchStart: string;
  lunchEnd: string;
}

/** Dias que fogem do horário padrão guardam seus próprios blocos aqui. */
type Overrides = Record<number, BlockDraft[]>;

interface Props {
  data: WorkingHoursInput | undefined;
  isLoading: boolean;
  isPending: boolean;
  onSave: (input: WorkingHoursInput) => Promise<void>;
}

interface InlineTimeRangeFieldsProps {
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}

function createDefaultPattern(): PatternDraft {
  return {
    selectedWeekdays: [],
    startTime: "09:00",
    endTime: "18:00",
    hasLunch: false,
    lunchStart: "12:00",
    lunchEnd: "13:00",
  };
}

function sortBlocks(blocks: BlockDraft[]): BlockDraft[] {
  return blocks.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function blockSig(blocks: BlockDraft[]): string {
  return sortBlocks(blocks)
    .map((block) => `${block.startTime}-${block.endTime}`)
    .join("|");
}

/** Constrói os blocos do horário padrão; com almoço, divide em dois turnos. */
function buildBlocksFromPattern(pattern: PatternDraft): BlockDraft[] {
  if (!pattern.hasLunch) {
    return [{ startTime: pattern.startTime, endTime: pattern.endTime }];
  }
  return [
    { startTime: pattern.startTime, endTime: pattern.lunchStart },
    { startTime: pattern.lunchEnd, endTime: pattern.endTime },
  ];
}

function buildDayDraftsFromInput(input: WorkingHoursInput | undefined): DayDraft[] {
  const drafts: DayDraft[] = DAY_LABELS.map((_, weekday) => ({ weekday, blocks: [] }));
  for (const shift of input?.shifts ?? []) {
    const day = drafts[shift.weekday];
    if (!day) continue;
    day.blocks.push({ startTime: shift.startTime, endTime: shift.endTime });
  }
  return drafts.map((day) => ({ ...day, blocks: sortBlocks(day.blocks) }));
}

/** Deriva o padrão (mais comum) e as exceções a partir do estado salvo. */
function inferStateFromInput(input: WorkingHoursInput | undefined): {
  pattern: PatternDraft;
  overrides: Overrides;
} {
  const working = buildDayDraftsFromInput(input).filter((day) => day.blocks.length > 0);
  if (working.length === 0) {
    return { pattern: createDefaultPattern(), overrides: {} };
  }

  const counts: Record<string, number> = {};
  for (const day of working) {
    const sig = blockSig(day.blocks);
    counts[sig] = (counts[sig] ?? 0) + 1;
  }
  const standardSig = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
  const standardDay = working.find((day) => blockSig(day.blocks) === standardSig)!;
  const standard = sortBlocks(standardDay.blocks);
  const selectedWeekdays = working.map((day) => day.weekday).sort((a, b) => a - b);

  const pattern: PatternDraft =
    standard.length >= 2
      ? {
          selectedWeekdays,
          startTime: standard[0]!.startTime,
          endTime: standard[standard.length - 1]!.endTime,
          hasLunch: true,
          lunchStart: standard[0]!.endTime,
          lunchEnd: standard[1]!.startTime,
        }
      : {
          selectedWeekdays,
          startTime: standard[0]!.startTime,
          endTime: standard[0]!.endTime,
          hasLunch: false,
          lunchStart: "12:00",
          lunchEnd: "13:00",
        };

  const overrides: Overrides = {};
  for (const day of working) {
    if (blockSig(day.blocks) !== standardSig) {
      overrides[day.weekday] = sortBlocks(day.blocks);
    }
  }

  return { pattern, overrides };
}

function serialize(pattern: PatternDraft, overrides: Overrides): WorkingHoursInput {
  const standard = buildBlocksFromPattern(pattern);
  const shifts = pattern.selectedWeekdays.flatMap((weekday) =>
    sortBlocks(overrides[weekday] ?? standard).map((block) => ({
      weekday,
      startTime: block.startTime,
      endTime: block.endTime,
    })),
  );
  return {
    shifts: shifts.sort(
      (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
    ),
  };
}

function formatBlocks(blocks: BlockDraft[]): string {
  if (blocks.length === 0) return "Folga";
  return sortBlocks(blocks)
    .map((block) => `${block.startTime}–${block.endTime}`)
    .join(" • ");
}

function toggleInList(list: number[], weekday: number): number[] {
  return list.includes(weekday)
    ? list.filter((item) => item !== weekday)
    : [...list, weekday].sort((a, b) => a - b);
}

function validate(pattern: PatternDraft, overrides: Overrides): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!TIME_REGEX.test(pattern.startTime)) errors.startTime = "Formato HH:mm inválido";
  if (!TIME_REGEX.test(pattern.endTime)) errors.endTime = "Formato HH:mm inválido";
  if (
    TIME_REGEX.test(pattern.startTime) &&
    TIME_REGEX.test(pattern.endTime) &&
    pattern.startTime >= pattern.endTime
  ) {
    errors.endTime = "Fim deve ser maior que início";
  }

  if (pattern.hasLunch) {
    if (!TIME_REGEX.test(pattern.lunchStart)) errors.lunchStart = "Formato HH:mm inválido";
    if (!TIME_REGEX.test(pattern.lunchEnd)) errors.lunchEnd = "Formato HH:mm inválido";
    if (
      TIME_REGEX.test(pattern.startTime) &&
      TIME_REGEX.test(pattern.endTime) &&
      TIME_REGEX.test(pattern.lunchStart) &&
      TIME_REGEX.test(pattern.lunchEnd)
    ) {
      if (!(pattern.startTime < pattern.lunchStart)) {
        errors.lunchStart = "Almoço precisa começar dentro do expediente";
      }
      if (!(pattern.lunchStart < pattern.lunchEnd)) {
        errors.lunchEnd = "Fim do almoço deve ser maior que início";
      }
      if (!(pattern.lunchEnd < pattern.endTime)) {
        errors.lunchEnd = "Almoço precisa terminar antes do fim";
      }
    }
  }

  for (const [key, blocks] of Object.entries(overrides)) {
    const weekday = Number(key);
    const sorted = sortBlocks(blocks);
    sorted.forEach((block, index) => {
      if (!TIME_REGEX.test(block.startTime)) {
        errors[`ov-${weekday}-${index}-start`] = "Formato HH:mm inválido";
      }
      if (!TIME_REGEX.test(block.endTime)) {
        errors[`ov-${weekday}-${index}-end`] = "Formato HH:mm inválido";
      }
      if (
        TIME_REGEX.test(block.startTime) &&
        TIME_REGEX.test(block.endTime) &&
        block.startTime >= block.endTime
      ) {
        errors[`ov-${weekday}-${index}-end`] = "Fim deve ser maior que início";
      }
    });
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index]!;
      const next = sorted[index + 1]!;
      if (
        [current.startTime, current.endTime, next.startTime, next.endTime].every((time) =>
          TIME_REGEX.test(time),
        ) &&
        current.endTime > next.startTime
      ) {
        errors[`ov-${weekday}-overlap`] = "Blocos do mesmo dia não podem se sobrepor";
      }
    }
  }

  return errors;
}

function InlineTimeRangeFields({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: InlineTimeRangeFieldsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-operational-muted)] px-3 py-3">
      <span className="text-sm text-[var(--color-muted-foreground)]">Das</span>
      <Input type="time" value={startValue} onChange={(e) => onStartChange(e.target.value)} className="h-9 w-32" />
      <span className="text-sm text-[var(--color-muted-foreground)]">até</span>
      <Input type="time" value={endValue} onChange={(e) => onEndChange(e.target.value)} className="h-9 w-32" />
    </div>
  );
}

export function WorkingHoursEditor({ data, isLoading, isPending, onSave }: Props) {
  const [pattern, setPattern] = useState<PatternDraft>(createDefaultPattern);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [expandedDays, setExpandedDays] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    const inferred = inferStateFromInput(data);
    setPattern(inferred.pattern);
    setOverrides(inferred.overrides);
    setExpandedDays([]);
    setErrors({});
    setServerError(null);
  }, [data]);

  const standardBlocks = buildBlocksFromPattern(pattern);

  function patchPattern<K extends keyof PatternDraft>(field: K, value: PatternDraft[K]) {
    setServerError(null);
    setErrors({});
    setPattern((current) => ({ ...current, [field]: value }));
  }

  function toggleWorkingDay(weekday: number) {
    setServerError(null);
    setErrors({});
    setPattern((current) => ({
      ...current,
      selectedWeekdays: toggleInList(current.selectedWeekdays, weekday),
    }));
    setOverrides((current) => {
      if (!current[weekday]) return current;
      const next = { ...current };
      delete next[weekday];
      return next;
    });
    setExpandedDays((current) => current.filter((day) => day !== weekday));
  }

  function dayBlocks(weekday: number): BlockDraft[] {
    return overrides[weekday] ?? standardBlocks;
  }

  /** Grava o override do dia; se voltar a bater com o padrão, deixa de ser exceção. */
  function commitDay(weekday: number, blocks: BlockDraft[]) {
    setServerError(null);
    setOverrides((current) => {
      const sorted = sortBlocks(blocks);
      if (blockSig(sorted) === blockSig(standardBlocks)) {
        const next = { ...current };
        delete next[weekday];
        return next;
      }
      return { ...current, [weekday]: sorted };
    });
  }

  function setDayBlock(weekday: number, index: number, field: keyof BlockDraft, value: string) {
    const base = sortBlocks(dayBlocks(weekday));
    commitDay(
      weekday,
      base.map((block, i) => (i === index ? { ...block, [field]: value } : block)),
    );
  }

  function addDayBlock(weekday: number) {
    commitDay(weekday, [...sortBlocks(dayBlocks(weekday)), { startTime: "09:00", endTime: "18:00" }]);
  }

  function removeDayBlock(weekday: number, index: number) {
    commitDay(
      weekday,
      sortBlocks(dayBlocks(weekday)).filter((_, i) => i !== index),
    );
  }

  function resetDayToStandard(weekday: number) {
    setServerError(null);
    setOverrides((current) => {
      const next = { ...current };
      delete next[weekday];
      return next;
    });
  }

  function toggleExpanded(weekday: number) {
    setExpandedDays((current) =>
      current.includes(weekday)
        ? current.filter((day) => day !== weekday)
        : [...current, weekday],
    );
  }

  async function handleSave() {
    const nextErrors = validate(pattern, overrides);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setServerError(null);
    try {
      await onSave(serialize(pattern, overrides));
      toast.success("Jornada salva");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "WORKING_HOURS_CONFLICT") {
          const message =
            "Existem horários sobrepostos no mesmo dia. Ajuste os intervalos e tente novamente.";
          setServerError(message);
          toast.error(message, { description: `${error.code} — Ref: ${error.requestId || "N/A"}` });
          return;
        }
        const fieldErrors = extractFieldErrors(error);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors((current) => ({ ...current, ...fieldErrors }));
        }
        const { code, message, requestId } = formatGlobalError(error);
        setServerError(message);
        toast.error(message, { description: `${code} — Ref: ${requestId || "N/A"}` });
      } else {
        setServerError("Erro ao conectar.");
        toast.error("Erro ao conectar.");
      }
    }
  }

  if (isLoading) {
    return (
      <OperationalPanel variant="muted">
        <OperationalPanelContent className="p-4 pt-4">
          <LoadingState variant="inline" message="Carregando jornada..." />
        </OperationalPanelContent>
      </OperationalPanel>
    );
  }

  const workingDays = WEEKDAY_ORDER.filter((weekday) => pattern.selectedWeekdays.includes(weekday));

  return (
    <OperationalPanel variant="muted">
      <OperationalPanelContent className="space-y-6 pt-5 sm:pt-6">
        {serverError ? (
          <div className="rounded-[var(--radius-control)] border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-4 py-3 text-sm text-[var(--color-destructive)]">
            {serverError}
          </div>
        ) : null}

        {/* Dias de atendimento */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-[var(--color-foreground)]">Dias de atendimento</div>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_ORDER.map((weekday) => {
              const selected = pattern.selectedWeekdays.includes(weekday);
              return (
                <button
                  key={weekday}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleWorkingDay(weekday)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    selected
                      ? "border-[var(--color-accent-strong)]/40 bg-[var(--color-accent-soft)] text-[var(--color-foreground)]"
                      : "border-[var(--color-border-strong)] bg-[var(--color-surface-operational-strong)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                  ].join(" ")}
                >
                  {DAY_LABELS[weekday]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Horário padrão */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-[var(--color-foreground)]">Horário padrão</div>
          <InlineTimeRangeFields
            startValue={pattern.startTime}
            endValue={pattern.endTime}
            onStartChange={(value) => patchPattern("startTime", value)}
            onEndChange={(value) => patchPattern("endTime", value)}
          />
          {errors.startTime || errors.endTime ? (
            <p className="text-xs text-[var(--color-destructive)]">{errors.startTime || errors.endTime}</p>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-sm text-[var(--color-muted-foreground)]">
              Almoço {pattern.hasLunch ? "(divide o dia em dois turnos)" : ""}
            </span>
            <Button
              type="button"
              variant={pattern.hasLunch ? "secondary" : "outline"}
              size="sm"
              onClick={() => patchPattern("hasLunch", !pattern.hasLunch)}
            >
              {pattern.hasLunch ? "Remover almoço" : "Adicionar almoço"}
            </Button>
          </div>

          {pattern.hasLunch ? (
            <>
              <InlineTimeRangeFields
                startValue={pattern.lunchStart}
                endValue={pattern.lunchEnd}
                onStartChange={(value) => patchPattern("lunchStart", value)}
                onEndChange={(value) => patchPattern("lunchEnd", value)}
              />
              {errors.lunchStart || errors.lunchEnd ? (
                <p className="text-xs text-[var(--color-destructive)]">
                  {errors.lunchStart || errors.lunchEnd}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        {/* Dias selecionados — ajuste a exceção aqui */}
        {workingDays.length === 0 ? (
          <p className="border-t border-[var(--color-border-strong)] pt-5 text-sm text-[var(--color-muted-foreground)]">
            Selecione acima os dias em que você atende.
          </p>
        ) : (
          <div className="divide-y divide-[var(--color-border-strong)] border-t border-[var(--color-border-strong)] pt-1">
            {workingDays.map((weekday) => {
              const expanded = expandedDays.includes(weekday);
              const blocks = dayBlocks(weekday);
              const overridden = Boolean(overrides[weekday]);
              const dayError = errors[`ov-${weekday}-overlap`];

              return (
                <div key={weekday} className="py-1">
                  <div className="flex items-center gap-3 py-1.5">
                    <span className="w-10 shrink-0 text-sm font-semibold text-[var(--color-foreground)]">
                      {DAY_LABELS[weekday]}
                    </span>
                    <span className="flex-1 truncate text-sm text-[var(--color-muted-foreground)]">
                      {formatBlocks(blocks)}
                      {overridden ? (
                        <span className="ml-2 text-xs text-[var(--color-accent-strong)]">· ajustado</span>
                      ) : null}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => toggleExpanded(weekday)}>
                      {expanded ? "Fechar" : "Ajustar"}
                    </Button>
                  </div>

                  {expanded ? (
                    <div className="space-y-2 pb-3 pl-[52px]">
                      {sortBlocks(blocks).map((block, index) => (
                        <div key={`${weekday}-${index}`} className="flex flex-wrap items-center gap-2">
                          <Input
                            type="time"
                            value={block.startTime}
                            onChange={(e) => setDayBlock(weekday, index, "startTime", e.target.value)}
                            className="h-9 w-32"
                          />
                          <span className="text-sm text-[var(--color-muted-foreground)]">até</span>
                          <Input
                            type="time"
                            value={block.endTime}
                            onChange={(e) => setDayBlock(weekday, index, "endTime", e.target.value)}
                            className="h-9 w-32"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-[var(--color-destructive)]"
                            onClick={() => removeDayBlock(weekday, index)}
                            aria-label="Remover bloco"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {errors[`ov-${weekday}-${index}-start`] || errors[`ov-${weekday}-${index}-end`] ? (
                            <p className="w-full text-xs text-[var(--color-destructive)]">
                              {errors[`ov-${weekday}-${index}-start`] || errors[`ov-${weekday}-${index}-end`]}
                            </p>
                          ) : null}
                        </div>
                      ))}

                      {dayError ? (
                        <p className="text-xs text-[var(--color-destructive)]">{dayError}</p>
                      ) : null}

                      <div className="flex flex-wrap gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => addDayBlock(weekday)}>
                          <Plus className="h-3 w-3" /> Bloco
                        </Button>
                        {overridden ? (
                          <Button type="button" variant="ghost" size="sm" onClick={() => resetDayToStandard(weekday)}>
                            Voltar ao padrão
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar jornada
          </Button>
        </div>
      </OperationalPanelContent>
    </OperationalPanel>
  );
}
