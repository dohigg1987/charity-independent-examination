"use client";

import { FluentProvider } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { clarityLightTheme } from "./clarity-theme";

export function ClarityFluentProvider({ children }: { children: ReactNode }) {
  return (
    <FluentProvider
      className="clarity-fluent-provider"
      theme={clarityLightTheme}
      applyStylesToPortals
    >
      {children}
    </FluentProvider>
  );
}
