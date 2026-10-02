"use client";

import type { ReactNode } from "react";

// A submit button that asks "are you sure?" first — for destructive actions
// done from a server-action form.
export function ConfirmButton({
  action,
  id,
  message,
  title,
  children,
}: {
  action: (formData: FormData) => void;
  id: string;
  message: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="icon-btn" aria-label={title} title={title} style={{ color: "var(--muted)" }}>
        {children}
      </button>
    </form>
  );
}
