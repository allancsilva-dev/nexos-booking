"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
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
  "priceCents",
  "currency",
  "active",
] as const;

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
    priceCents: number;
    currency: string;
    active: boolean;
  };
  isPending: boolean;
  onSubmit: (data: UpdateServiceInput) => Promise<void>;
  onCancel: () => void;
}

export type ServiceFormProps = CreateProps | EditProps;

export function ServiceForm(props: ServiceFormProps) {
  const isCreate = props.mode === "create";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<any>({
    resolver: zodResolver(
      isCreate ? CreateServiceSchema : UpdateServiceSchema,
    ),
    defaultValues: isCreate
      ? { name: "", durationMin: 30, priceCents: 0, currency: "" }
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
                    <FormLabel>Preço (centavos)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="5000" {...field} />
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
