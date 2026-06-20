"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { RegisterSchema, type RegisterInput } from "@/lib/auth-schemas";
import { useRegisterMutation } from "@/hooks/use-auth";
import { EMAIL_TAKEN } from "@/lib/error-codes";
import { ApiError } from "@/lib/http-client";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function RegisterForm() {
  const router = useRouter();
  const registerMutation = useRegisterMutation();

  const form = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      organizationName: "",
    },
  });

  async function onSubmit(data: RegisterInput) {
    try {
      await registerMutation.mutateAsync(data);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === EMAIL_TAKEN) {
          toast.error("Este e-mail já está cadastrado.", {
            description: "Tente fazer login ou use outro e-mail.",
          });
        } else {
          toast.error(err.message, {
            description: `${err.code} — Ref: ${err.requestId || "N/A"}`,
          });
        }
      } else {
        toast.error("Erro ao conectar. Verifique sua rede.");
      }
    }
  }

  return (
    <Card className="w-full max-w-md border-0 bg-transparent shadow-none">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-[var(--color-foreground)]">
          Criar conta
        </CardTitle>
        <CardDescription>
          Cadastre sua barbearia e comece a usar
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Seu nome"
                      autoComplete="name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="voce@exemplo.com"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Mínimo de 8 caracteres"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="organizationName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da barbearia (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Barbearia do Zé"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Criar conta
            </Button>
          </form>
        </Form>

        {registerMutation.isError &&
          registerMutation.error instanceof ApiError &&
          registerMutation.error.code !== EMAIL_TAKEN && (
            <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 p-3 text-center">
              <p className="text-xs font-mono text-[var(--color-destructive)] uppercase tracking-wider">
                {registerMutation.error.code}
              </p>
              <p className="text-sm text-[var(--color-foreground)] mt-1">
                {registerMutation.error.message}
              </p>
              {registerMutation.error.requestId && (
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                  Ref: {registerMutation.error.requestId}
                </p>
              )}
            </div>
          )}

        <div className="mt-6 text-center text-sm text-[var(--color-muted-foreground)]">
          Já tem conta?{" "}
          <Link
            href="/login"
            className="text-[var(--color-primary)] hover:underline font-medium"
          >
            Fazer login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
