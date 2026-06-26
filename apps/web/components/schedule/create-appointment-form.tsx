"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, CalendarPlus } from "lucide-react";
import { CreateAppointmentSchema, type CreateAppointmentInput } from "@nexos/shared";
import { ApiError } from "@/lib/http-client";
import { applyFormFieldErrors } from "@/lib/error-handler";
import { useStableIdempotencyKey } from "@/hooks/use-stable-idempotency-key";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FORM_FIELDS = ["client.name", "client.phone", "note", "startsAt"] as const;

interface Props {
  professionalId: string;
  serviceId: string;
  startsAt: string;
  isPending: boolean;
  onSubmit: (input: CreateAppointmentInput, idempotencyKey: string) => Promise<void>;
  onCancel: () => void;
}

export function CreateAppointmentForm({
  professionalId,
  serviceId,
  startsAt,
  isPending,
  onSubmit,
  onCancel,
}: Props) {
  const { getKey, resetKey } = useStableIdempotencyKey();
  const form = useForm<CreateAppointmentInput>({
    resolver: zodResolver(CreateAppointmentSchema),
    defaultValues: {
      professionalId,
      serviceId,
      startsAt,
      client: { name: "", phone: "" },
      note: "",
      allowOutsideHours: false,
    },
  });

  // Atualiza campos ocultos se props mudarem
  useEffect(() => {
    form.setValue("professionalId", professionalId);
    form.setValue("serviceId", serviceId);
    form.setValue("startsAt", startsAt);
    resetKey();
  }, [professionalId, serviceId, startsAt, form, resetKey]);

  async function handleSubmit(data: CreateAppointmentInput) {
    const idempotencyKey = getKey();
    try {
      await onSubmit(data, idempotencyKey);
      form.reset();
      resetKey();
    } catch (err) {
      if (err instanceof ApiError) {
        resetKey();
        const { applied, unknownFields } = applyFormFieldErrors(
          err,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          form.setError as any,
          FORM_FIELDS,
        );
        if (applied === 0) {
          toast.error(
            unknownFields.length > 0
              ? unknownFields.map((d) => `${d.field}: ${d.issue}`).join("; ")
              : err.message,
            { description: `${err.code} — Ref: ${err.requestId || "N/A"}` },
          );
        } else if (unknownFields.length > 0) {
          toast.error(unknownFields.map((d) => `${d.field}: ${d.issue}`).join("; "), {
            description: `Ref: ${err.requestId || "N/A"}`,
          });
        }
      } else {
        toast.error("Erro ao conectar.");
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Novo agendamento</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="client.name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do cliente</FormLabel>
                    <FormControl><Input placeholder="Maria" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="client.phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl><Input placeholder="(11) 99999-9999" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observação</FormLabel>
                  <FormControl><Input placeholder="Cliente novo" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                Agendar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetKey();
                  onCancel();
                }}
                disabled={isPending}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
