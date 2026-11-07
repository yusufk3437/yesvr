import type { Messages } from "@/i18n/messages";
import { fmt } from "./l10n";
import type { Notification } from "./types";

/** Sample e-mail rendered from the same notification event and parameters. */
export function renderEmail(n: Notification, name: string, m: Messages, statusLabel: (s: string) => string) {
  const tpl = m.emails.templates[n.kind];
  const params: Record<string, string> = { ...n.params };
  if (params.status) params.status = statusLabel(params.status);
  return {
    subject: fmt(tpl.subject, params),
    greeting: fmt(m.emails.greeting, { name }),
    body: fmt(tpl.body, params),
  };
}
