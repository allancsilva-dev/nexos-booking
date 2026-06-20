import { AuthHero } from "@/components/auth/auth-hero";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex w-full max-w-4xl overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)]">
      <div className="hidden w-1/2 lg:flex">
        <AuthHero />
      </div>
      <div className="flex w-full items-center justify-center p-8 lg:w-1/2">
        <LoginForm />
      </div>
    </div>
  );
}
