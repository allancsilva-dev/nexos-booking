"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import {
  CreateProfessionalSchema,
  UpdateProfessionalSchema,
  type CreateProfessionalInput,
  type UpdateProfessionalInput,
} from "@/lib/professional-schemas";
import { ApiError } from "@/lib/http-client";
import { applyFormFieldErrors } from "@/lib/error-handler";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FORM_FIELDS = ["name", "slug", "active"] as const;

interface CreateProps {
  mode: "create";
  isPending: boolean;
  onSubmit: (data: CreateProfessionalInput) => Promise<void>;
  onCancel: () => void;
}

interface EditProps {
  mode: "edit";
  defaultValues: { name: string; slug: string; active: boolean };
  isPending: boolean;
  onSubmit: (data: UpdateProfessionalInput) => Promise<void>;
  onCancel: () => void;
}

export type ProfessionalFormProps = CreateProps | EditProps;

export function ProfessionalForm(props: ProfessionalFormProps) {
  const isCreate = props.mode === "create";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<any>({
    resolver: zodResolver(isCreate ? CreateProfessionalSchema : UpdateProfessionalSchema),
    defaultValues: isCreate
      ? { name: "", slug: "" }
      : props.defaultValues,
  });

  async function handleSubmit(data: CreateProfessionalInput | UpdateProfessionalInput) {
    try {
      if (isCreate) {
        await (props as CreateProps).onSubmit(data as CreateProfessionalInput);
      } else {
        await (props as EditProps).onSubmit(data as UpdateProfessionalInput);
      }
      if (isCreate) form.reset();
    } catch (err) {
      if (err instanceof ApiError) {
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
              : `${err.code}: ${err.message}`,
            { description: `Ref: ${err.requestId || "N/A"}` },
          );
        } else if (unknownFields.length > 0) {
          toast.error(unknownFields.map((d) => `${d.field}: ${d.issue}`).join("; "), {
            description: `Ref: ${err.requestId || "N/A"}`,
          });
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
          {isCreate ? "Novo profissional" : "Editar profissional"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl><Input placeholder="Zé" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug (URL)</FormLabel>
                  <FormControl>
                    <Input placeholder="ze" {...field} value={field.value ?? ""} />
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
                        className="h-4 w-4 rounded border-[var(--color-border)]"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0 cursor-pointer">Ativo</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={props.isPending}>
                {props.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isCreate ? "Criar" : "Salvar"}
              </Button>
              <Button type="button" variant="outline" onClick={props.onCancel} disabled={props.isPending}>
                Cancelar
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
