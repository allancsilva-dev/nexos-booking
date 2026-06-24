"use client";

import { use } from "react";
import { CancelForm } from "@/components/public/cancel-form";

export default function CancelarTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <CancelForm initialToken={token} />;
}
