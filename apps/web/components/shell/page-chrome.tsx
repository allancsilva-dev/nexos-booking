"use client";

type PageChromeProps = {
  title: string;
  subtitle?: string;
};

export function PageChrome({ title, subtitle }: PageChromeProps) {
  return (
    <div className="mx-auto mb-5 w-full max-w-[1180px] px-1">
      <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--color-foreground)]">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-[13px] font-medium text-[var(--color-muted-foreground)]">
          {subtitle}
        </p>
      )}
    </div>
  );
}
