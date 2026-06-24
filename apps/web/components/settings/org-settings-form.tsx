"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { UpdateOrgSchema, type UpdateOrgInput } from "@/lib/org-schemas";
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
import type { OrganizationDTO } from "@nexos/shared";

const FORM_FIELDS = ["name", "timezone", "slotIntervalMin"] as const;

interface Props {
  org: OrganizationDTO;
  isPending: boolean;
  onSubmit: (data: UpdateOrgInput) => Promise<void>;
}

export function OrgSettingsForm({ org, isPending, onSubmit }: Props) {
  const form = useForm<UpdateOrgInput>({
    resolver: zodResolver(UpdateOrgSchema),
    defaultValues: {
      name: org.name,
      timezone: org.timezone,
      slotIntervalMin: org.slotIntervalMin,
    },
  });

  async function handleSubmit(data: UpdateOrgInput) {
    try {
      await onSubmit(data);
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
        <CardTitle className="text-lg">Configurações da empresa</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da empresa</FormLabel>
                  <FormControl>
                    <Input placeholder="Barbearia do Zé" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fuso horário (IANA)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="America/Sao_Paulo"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slotIntervalMin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Intervalo dos slots (min)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="30"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
