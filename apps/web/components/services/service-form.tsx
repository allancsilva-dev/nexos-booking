"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CircleHelp, Loader2, Save } from "lucide-react";
import {
  CreateServiceSchema,
  UpdateServiceSchema,
  type CreateServiceInput,
  type UpdateServiceInput,
} from "@/lib/service-schemas";
import { ApiError } from "@/lib/http-client";
import { applyFormFieldErrors } from "@/lib/error-handler";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FORM_FIELDS = [
  "name",
  "durationMin",
  "bufferAfterMin",
  "priceCents",
  "currency",
  "active",
] as const;

// Conversão reais <-> centavos para o campo de preço.
// O contrato/schema permanecem em centavos (priceCents); a máscara é só de UI.
function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function reaisToCents(text: string): number {
  const normalized = text.replace(/\./g, "").replace(",", ".").trim();
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

// ---------------------------------------------------------------------------
// ServiceForm — create (mode="create") ou edit (mode="edit")
// Formulário inline, sem Dialog.
// ---------------------------------------------------------------------------

interface CreateProps {
  mode: "create";
  isPending: boolean;
  onSubmit: (data: CreateServiceInput) => Promise<void>;
  onCancel: () => void;
}

interface EditProps {
  mode: "edit";
  defaultValues: {
    name: string;
    durationMin: number;
    bufferAfterMin: number | null;
    priceCents: number;
    currency: string;
    active: boolean;
  };
  isPending: boolean;
  onSubmit: (data: UpdateServiceInput) => Promise<void>;
  onCancel: () => void;
}

export type ServiceFormProps = CreateProps | EditProps;

const BUFFER_HELP_TEXT =
  "Tempo de pausa entre um atendimento e o proximo para este servico. Exemplo: se o servico dura 50 minutos e o intervalo for 10, o proximo horario ficara disponivel 60 minutos depois do inicio. Use 0 para nao adicionar pausa.";

export function ServiceForm(props: ServiceFormProps) {
  const isCreate = props.mode === "create";

  const initialPriceCents = isCreate ? 0 : props.defaultValues.priceCents;
  const [priceText, setPriceText] = useState(
    initialPriceCents ? centsToReais(initialPriceCents) : "",
  );
  const [bufferHelpOpen, setBufferHelpOpen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<any>({
    resolver: zodResolver(
      isCreate ? CreateServiceSchema : UpdateServiceSchema,
    ),
    defaultValues: isCreate
      ? {
          name: "",
          durationMin: 30,
          bufferAfterMin: 0,
          priceCents: 0,
          currency: "",
        }
      : props.defaultValues,
  });

  async function handleSubmit(data: CreateServiceInput | UpdateServiceInput) {
    try {
      if (isCreate) {
        await (props as CreateProps).onSubmit(data as CreateServiceInput);
      } else {
        await (props as EditProps).onSubmit(data as UpdateServiceInput);
      }
      form.reset();
      setPriceText("");
    } catch (err) {
      if (err instanceof ApiError) {
        const { applied, unknownFields } = applyFormFieldErrors(
          err,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          form.setError as any,
          FORM_FIELDS,
        );
        if (applied === 0) {
          const msg =
            unknownFields.length > 0
              ? unknownFields.map((d) => `${d.field}: ${d.issue}`).join("; ")
              : `${err.code}: ${err.message}`;
          toast.error(msg, {
            description: `Ref: ${err.requestId || "N/A"}`,
          });
        } else if (unknownFields.length > 0) {
          toast.error(
            unknownFields.map((d) => `${d.field}: ${d.issue}`).join("; "),
            { description: `Ref: ${err.requestId || "N/A"}` },
          );
        }
      } else {
        toast.error("Erro ao conectar. Verifique sua rede.");
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {isCreate ? "Novo serviço" : "Editar serviço"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="Corte" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="durationMin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duração (min)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="30" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priceCents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço (R$)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="0,00"
                        name={field.name}
                        ref={field.ref}
                        value={priceText}
                        onChange={(e) => {
                          setPriceText(e.target.value);
                          field.onChange(reaisToCents(e.target.value));
                        }}
                        onBlur={(e) => {
                          const cents = reaisToCents(e.target.value);
                          setPriceText(cents ? centsToReais(cents) : "");
                          field.onChange(cents);
                          field.onBlur();
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bufferAfterMin"
                render={({ field }) => (
                  <FormItem>
                    <div className="relative">
                      <FormLabel className="flex items-center gap-1.5">
                        <span>Intervalo entre atendimentos (min)</span>
                        <button
                          type="button"
                          aria-label="Explicar intervalo entre atendimentos"
                          className="relative inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                          onMouseEnter={() => setBufferHelpOpen(true)}
                          onMouseLeave={() => setBufferHelpOpen(false)}
                          onClick={() => setBufferHelpOpen((open) => !open)}
                          onBlur={() => setBufferHelpOpen(false)}
                        >
                          <CircleHelp className="h-4 w-4" />
                        </button>
                      </FormLabel>
                      {bufferHelpOpen ? (
                        <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-foreground)] shadow-lg">
                          {BUFFER_HELP_TEXT}
                        </div>
                      ) : null}
                    </div>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moeda</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="BRL"
                        maxLength={3}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isCreate && (
                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value ?? true}
                          onChange={field.onChange}
                          className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-background)]"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0 cursor-pointer">
                        Ativo
                      </FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={props.isPending}>
                {props.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isCreate ? "Criar" : "Salvar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={props.onCancel}
                disabled={props.isPending}
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
