import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { usePaneNavigate } from "./PaneContext";

/** A link inside a pane. A plain click opens the path in this pane;
 * Ctrl+click, Cmd+click, or a middle-click opens it in a new pane. Renders
 * a real anchor so it is focusable and shows the destination. */
export function PaneLink({
  to,
  children,
  onClick,
  ...rest
}: { to: string; children: ReactNode; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  const navigate = usePaneNavigate();
  function go(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    onClick?.(e);
    navigate(to, e);
  }
  return (
    <a href={`#${to}`} onClick={go} onAuxClick={(e) => e.button === 1 && go(e)} {...rest}>
      {children}
    </a>
  );
}
