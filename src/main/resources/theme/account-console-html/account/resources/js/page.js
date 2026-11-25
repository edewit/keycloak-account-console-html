import { html, css, nothing } from "lit";

/**
 * Shared helpers for account page Lit elements (emit, status chrome, message styles).
 */

/**
 * Resolve Keycloak message keys wrapped as `${key}` (client / IdP display names).
 *
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @param {string | undefined} name
 * @returns {string}
 */
export function label(t, name) {
  if (!name) {
    return "";
  }
  if (name.startsWith("${") && name.endsWith("}")) {
    const key = name.slice(2, -1);
    const translated = t(key);
    return translated !== key ? translated : key;
  }
  const translated = t(name);
  return translated !== name ? translated : name;
}

/**
 * Events dispatched by account page components via {@link emitEvent}.
 *
 * @typedef {"load" | "error" | "save" | "saved" | "action" | "sign-out" | "signed-out" | "end-session" | "remove-consent" | "removed" | "link" | "unlink" | "unlinked" | "issue" | "revoke" | "revoked"} AccountPageEventType
 */

/**
 * Dispatch a bubbling, composed CustomEvent from a page component.
 *
 * @param {EventTarget} host
 * @param {AccountPageEventType} type
 * @param {unknown} [detail]
 * @param {{ cancelable?: boolean }} [options]
 * @returns {boolean} false if a cancelable event was canceled
 */
export function emitEvent(host, type, detail, options = {}) {
  return host.dispatchEvent(
    new CustomEvent(type, {
      detail,
      bubbles: true,
      composed: true,
      cancelable: Boolean(options.cancelable),
    }),
  );
}

/** Title, description, and status message styles shared by account pages. */
export const pageChromeStyles = css`
  h1 {
    margin: 0 0 0.35rem;
    font-size: 1.5rem;
  }

  .description {
    margin: 0 0 var(--account-gap, 1.25rem);
    color: var(--account-label-color, currentColor);
  }

  .message {
    margin: var(--account-message-margin, 0) 0 0;
    font-size: 0.9rem;
  }

  .message[data-tone="error"] {
    color: var(--account-error-color, #b42318);
  }

  .message[data-tone="success"] {
    color: var(--account-success-color, #027a48);
  }
`;

/**
 * @param {string} label
 */
export function renderLoading(label) {
  return html`<p part="message" class="message">${label}</p>`;
}

/**
 * @param {string} message
 */
export function renderLoadError(message) {
  return html`
    <p part="message" class="message" data-tone="error">${message}</p>
  `;
}

/**
 * Inline status message (empty when there is no text).
 *
 * @param {string | undefined | null} message
 * @param {string} [tone]
 */
export function renderMessage(message, tone) {
  if (!message) {
    return nothing;
  }
  return html`
    <p part="message" class="message" data-tone=${tone || nothing}>
      ${message}
    </p>
  `;
}
