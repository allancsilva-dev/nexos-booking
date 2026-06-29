"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface PageChrome {
  title: string;
  subtitle: string;
  action: ReactNode | null;
}

interface PageChromeContextValue extends PageChrome {
  setChrome: (chrome: Partial<PageChrome>) => void;
  resetChrome: () => void;
}

const DEFAULT_CHROME: PageChrome = {
  title: "",
  subtitle: "",
  action: null,
};

const PageChromeContext = createContext<PageChromeContextValue | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChromeState] = useState<PageChrome>(DEFAULT_CHROME);

  function setChrome(next: Partial<PageChrome>) {
    setChromeState((prev) => ({ ...prev, ...next }));
  }

  function resetChrome() {
    setChromeState(DEFAULT_CHROME);
  }

  return (
    <PageChromeContext.Provider value={{ ...chrome, setChrome, resetChrome }}>
      {children}
    </PageChromeContext.Provider>
  );
}

export function usePageChrome() {
  const ctx = useContext(PageChromeContext);
  if (!ctx) {
    throw new Error("usePageChrome must be used within PageChromeProvider");
  }
  return ctx;
}

/**
 * Declarative helper a page mounts to set the topbar title/subtitle/action.
 * Title and subtitle fall back to a route map in the topbar when omitted.
 */
export function PageChrome({
  title,
  subtitle,
  action,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { setChrome, resetChrome } = usePageChrome();

  useEffect(() => {
    setChrome({
      title: title ?? "",
      subtitle: subtitle ?? "",
      action: action ?? null,
    });
    return () => resetChrome();
  }, [title, subtitle, action]);

  return null;
}
