"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, LogIn } from "lucide-react";
import { LoginSchema, type LoginInput } from "@/lib/auth-schemas";
import { useLoginMutation } from "@/hooks/use-auth";
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

export function LoginForm() {
  const router = useRouter();
  const loginMutation = useLoginMutation();

  const form = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: LoginInput) {
    try {
      await loginMutation.mutateAsync(data);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message, {
          description: `${err.code} — Ref: ${err.requestId || "N/A"}`,
        });
      } else {
        toast.error("Erro ao conectar. Verifique sua rede.");
      }
    }
  }

  return (
    <Card className="w-full max-w-md border-0 bg-transparent shadow-none">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-[var(--color-foreground)]">
          Entrar
        </CardTitle>
        <CardDescription>
          Acesse sua conta para gerenciar a agenda
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      placeholder="••••••••"
                      autoComplete="current-password"
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
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              Entrar
            </Button>
          </form>
        </Form>

        {loginMutation.isError && loginMutation.error instanceof ApiError && (
          <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 p-3 text-center">
            <p className="text-xs font-mono text-[var(--color-destructive)] uppercase tracking-wider">
              {loginMutation.error.code}
            </p>
            <p className="text-sm text-[var(--color-foreground)] mt-1">
              {loginMutation.error.message}
            </p>
            {loginMutation.error.requestId && (
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                Ref: {loginMutation.error.requestId}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-[var(--color-muted-foreground)]">
          Não tem conta?{" "}
          <Link
            href="/register"
            className="text-[var(--color-primary)] hover:underline font-medium"
          >
            Criar uma
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
