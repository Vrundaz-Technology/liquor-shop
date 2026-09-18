"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { DataBootstrap } from "@/components/providers/DataBootstrap";
import { AppDialog } from "@/components/ui/AppDialog";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <DataBootstrap />
      <AppDialog />
      {children}
    </QueryClientProvider>
  );
}
