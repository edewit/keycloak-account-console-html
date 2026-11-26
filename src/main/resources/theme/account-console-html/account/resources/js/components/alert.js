import { LitElement, html, css, nothing } from "lit";

const AUTO_DISMISS_MS = 8000;

/**
 * Floating status alert (top-right). Auto-dismisses after 8 seconds.
 *
 *   <account-alert message="Saved" tone="success"></account-alert>
 *   <account-alert message="Failed" tone="error" @dismiss=${…}></account-alert>
 *
 * Style via `--account-alert-*` or ::part(alert|message|dismiss).
 */
export class AccountAlert extends LitElement {
  static properties = {
    message: { type: String },
    tone: { type: String, reflect: true },
  };

  static styles = css`
    :host {
      --account-alert-bg: var(
        --account-surface,
        light-dark(#ffffff, #1b1b1b)
      );
      --account-alert-fg: var(--account-fg, light-dark(#1b1b1b, #f0f0f0));
      --account-alert-border: var(
        --account-border-color,
        color-mix(in srgb, currentColor 25%, transparent)
      );
      --account-alert-radius: var(--account-radius, 0.5rem);
      --account-alert-shadow: 0 0.5rem 1.25rem
        color-mix(in srgb, #000 18%, transparent);
      --account-alert-error: var(--account-error-color, #b42318);
      --account-alert-success: var(--account-success-color, #027a48);
      --account-alert-inset: 1rem;
      --account-alert-max-width: min(24rem, calc(100vw - 2rem));
      --account-alert-z: 1000;

      display: contents;
      color-scheme: light dark;
    }

    .alert {
      position: fixed;
      top: var(--account-alert-inset);
      right: var(--account-alert-inset);
      z-index: var(--account-alert-z);
      box-sizing: border-box;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      max-width: var(--account-alert-max-width);
      padding: 0.85rem 1rem;
      border: 1px solid var(--account-alert-border);
      border-radius: var(--account-alert-radius);
      background: var(--account-alert-bg);
      color: var(--account-alert-fg);
      box-shadow: var(--account-alert-shadow);
      font: inherit;
      font-size: 0.95rem;
      line-height: 1.4;
      animation: account-alert-in 160ms ease-out;
    }

    .alert[data-tone="error"] {
      border-color: color-mix(in srgb, var(--account-alert-error) 45%, transparent);
      color: var(--account-alert-error);
    }

    .alert[data-tone="success"] {
      border-color: color-mix(
        in srgb,
        var(--account-alert-success) 45%,
        transparent
      );
      color: var(--account-alert-success);
    }

    .message {
      flex: 1;
      margin: 0;
      min-width: 0;
    }

    .dismiss {
      flex-shrink: 0;
      margin: -0.15rem -0.35rem -0.15rem 0;
      padding: 0.2rem 0.45rem;
      border: none;
      border-radius: 0.25rem;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
      opacity: 0.7;
    }

    .dismiss:hover,
    .dismiss:focus-visible {
      opacity: 1;
      outline: 2px solid currentColor;
      outline-offset: 1px;
    }

    @keyframes account-alert-in {
      from {
        opacity: 0;
        transform: translateY(-0.35rem);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #timer;

  constructor() {
    super();
    this.message = "";
    this.tone = "";
  }

  disconnectedCallback() {
    this.#clearTimer();
    super.disconnectedCallback();
  }

  /**
   * @param {Map<string, unknown>} changed
   */
  updated(changed) {
    if (changed.has("message")) {
      this.#clearTimer();
      if (this.message) {
        this.#timer = setTimeout(() => this.#dismiss(), AUTO_DISMISS_MS);
      }
    }
  }

  #clearTimer() {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  #dismiss() {
    this.#clearTimer();
    this.dispatchEvent(
      new CustomEvent("dismiss", {
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    if (!this.message) {
      return nothing;
    }

    const role = this.tone === "error" ? "alert" : "status";
    return html`
      <div
        class="alert"
        part="alert"
        role=${role}
        data-tone=${this.tone || nothing}
      >
        <p class="message" part="message">${this.message}</p>
        <button
          type="button"
          class="dismiss"
          part="dismiss"
          aria-label="Dismiss"
          @click=${() => this.#dismiss()}
        >
          ×
        </button>
      </div>
    `;
  }
}

customElements.define("account-alert", AccountAlert);
