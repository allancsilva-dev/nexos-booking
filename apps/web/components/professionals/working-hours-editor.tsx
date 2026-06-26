"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import type { WorkingHoursInput } from "@nexos/shared";
import { ApiError } from "@/lib/http-client";
import { extractFieldErrors, formatGlobalError } from "@/lib/error-handler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/loading-state";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface ShiftDraft {
  weekday: number;
  startTime: string;
  endTime: string;
}

interface Props {
  data: WorkingHoursInput | undefined;
  isLoading: boolean;
  isPending: boolean;
  onSave: (input: WorkingHoursInput) => Promise<void>;
}

export function WorkingHoursEditor({ data, isLoading, isPending, onSave }: Props) {
  const [shifts, setShifts] = useState<ShiftDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data && !initialized) {
      const sourceShifts = Array.isArray(data.shifts) ? data.shifts : [];
      setShifts(
        sourceShifts.map((s) => ({
          weekday: s.weekday,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
      );
      setInitialized(true);
    }
  }, [data, initialized]);

  function addShift(weekday: number) {
    setShifts((prev) => [
      ...prev,
      { weekday, startTime: "09:00", endTime: "18:00" },
    ]);
  }

  function removeShift(index: number) {
    setShifts((prev) => prev.filter((_, i) => i !== index));
  }

  function updateShift(index: number, field: "startTime" | "endTime", value: string) {
    setShifts((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    shifts.forEach((s, i) => {
      if (!TIME_REGEX.test(s.startTime)) {
        errs[`shift-${i}-start`] = "Formato HH:mm inválido";
      }
      if (!TIME_REGEX.test(s.endTime)) {
        errs[`shift-${i}-end`] = "Formato HH:mm inválido";
      }
      if (TIME_REGEX.test(s.startTime) && TIME_REGEX.test(s.endTime) && s.startTime >= s.endTime) {
        errs[`shift-${i}-end`] = "Fim deve ser maior que início";
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    const input: WorkingHoursInput = {
      shifts: shifts.map((s) => ({
        weekday: s.weekday,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    };
    try {
      await onSave(input);
      toast.success("Jornada salva");
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors = extractFieldErrors(err);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors((prev) => ({ ...prev, ...fieldErrors }));
        }
        const { code, message, requestId } = formatGlobalError(err);
        toast.error(message, { description: `${code} — Ref: ${requestId || "N/A"}` });
      } else {
        toast.error("Erro ao conectar.");
      }
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <LoadingState variant="inline" message="Carregando jornada..." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Jornada semanal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {DAY_LABELS.map((label, weekday) => {
          // Flatten: find all shift indices for this day
          const allIndices = shifts
            .map((s, i) => (s.weekday === weekday ? i : -1))
            .filter((i) => i >= 0);

          return (
            <div key={weekday} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-10 text-sm font-medium text-[var(--color-muted-foreground)]">
                  {label}
                </span>
                {allIndices.length === 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addShift(weekday)}
                  >
                    <Plus className="h-3 w-3" /> Adicionar
                  </Button>
                ) : (
                  <div className="flex-1 space-y-1">
                    {allIndices.map((idx) => {
                      const s = shifts[idx]!;
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={s.startTime}
                            onChange={(e) => updateShift(idx, "startTime", e.target.value)}
                            className="w-28 h-8 text-xs"
                          />
                          <span className="text-xs text-[var(--color-muted-foreground)]">até</span>
                          <Input
                            type="time"
                            value={s.endTime}
                            onChange={(e) => updateShift(idx, "endTime", e.target.value)}
                            className="w-28 h-8 text-xs"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeShift(idx)}
                            className="text-[var(--color-destructive)]"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          {errors[`shift-${idx}-end`] && (
                            <span className="text-xs text-[var(--color-destructive)]">
                              {errors[`shift-${idx}-end`]}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addShift(weekday)}
                    >
                      <Plus className="h-3 w-3" /> Pausa
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className="pt-2">
          <Button onClick={handleSave} disabled={isPending} size="sm">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar jornada
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
