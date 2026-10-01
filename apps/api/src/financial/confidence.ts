import type { Extraction } from "../ai/schema";

/**
 * Decides whether an AI extraction is clear enough to register automatically,
 * or whether the assistant should ask the user to confirm/clarify first
 * (see briefing section 11, "Confirmação inteligente").
 *
 * This is a UX/risk trade-off, not a technical one — tighter thresholds mean
 * more "are you sure?" messages (safer, more friction); looser thresholds
 * mean faster logging but more chance of a wrong auto-registered transaction
 * that the user has to notice and correct later.
 *
 * TODO(user): implement the real policy. Starting points to consider:
 *   - extraction.confianca is already 0-1 from the model.
 *   - extraction.valor === null or extraction.categoria === null should
 *     probably always force a clarification question, regardless of confianca.
 *   - High-value transactions (e.g. > R$1000) might deserve a stricter bar
 *     than a R$20 lanche, since a mistake there is more costly to the user.
 *   - extraction.pergunta_esclarecimento is already populated by the AI when
 *     it thinks something is unclear — you can lean on that directly, or layer
 *     your own threshold on top of it.
 */
export function shouldAutoConfirm(extraction: Extraction): boolean {
  // Placeholder: currently trusts the AI's own judgment call via
  // pergunta_esclarecimento, with no extra threshold on top. Replace with
  // the policy described above.
  return extraction.pergunta_esclarecimento === null && extraction.valor !== null && extraction.categoria !== null;
}
