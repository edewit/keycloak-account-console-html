import { LitElement, html, css } from "lit";

/**
 * Native modal dialog shell for account console pages.
 *
 *   <account-dialog .open=${true} @close=${…}>
 *     <span slot="title">Title</span>
 *     <p>Body</p>
 *     <button slot="actions" type="button">Cancel</button>
 *   </account-dialog>
 *
 * Top-layer `<dialog>` does not inherit page colors; uses `--account-surface`
 * / `--account-fg` (or light-dark fallbacks).
 *
 * Style via `--account-dialog-*` or ::part(dialog|body|title|content|actions).
 */
export class AccountDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
  };

  static styles = css`
    :host {
      --account-dialog-bg: var(
        --account-surface,
        light-dark(#ffffff, #1b1b1b)
      );
      --account-dialog-fg: var(--account-fg, light-dark(#1b1b1b, #f0f0f0));
      --account-dialog-muted: var(
        --account-muted-color,
        color-mix(in srgb, currentColor 55%, transparent)
      );
      --account-dialog-border: var(
        --account-border-color,
        color-mix(in srgb, currentColor 25%, transparent)
      );
      --account-dialog-radius: var(--account-radius, 0.5rem);
      --account-dialog-backdrop: color-mix(in srgb, #000 45%, transparent);
      --account-dialog-max-width: min(32rem, calc(100vw - 2rem));

      display: contents;
    }

    dialog {
      border: 1px solid var(--account-dialog-border);
      border-radius: var(--account-dialog-radius);
      padding: 0;
      max-width: var(--account-dialog-max-width);
      width: 100%;
      background: var(--account-dialog-bg);
      color: var(--account-dialog-fg);
      color-scheme: light dark;
    }

    dialog::backdrop {
      background: var(--account-dialog-backdrop);
    }

    .body {
      padding: 1.1rem 1.25rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .title {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 600;
    }

    .title:empty {
      display: none;
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .actions:not(:has(*)) {
      display: none;
    }
  `;

  constructor() {
    super();
    this.open = false;
    /** @type {boolean} */
    this.#closing = false;
  }

  /** @type {boolean} */
  #closing;

  /**
   * @returns {HTMLDialogElement | null}
   */
  get #dialog() {
    return this.renderRoot?.querySelector("dialog") ?? null;
  }

  updated(changed) {
    if (!changed.has("open")) {
      return;
    }
    const el = this.#dialog;
    if (!el) {
      return;
    }
    if (this.open && !el.open) {
      el.showModal();
    } else if (!this.open && el.open && !this.#closing) {
      this.#closing = true;
      el.close();
    }
  }

  /**
   * @param {Event} event
   */
  #onCancel(event) {
    event.preventDefault();
    this.#requestClose("cancel");
  }

  #onNativeClose() {
    this.#closing = false;
    if (this.open) {
      this.open = false;
      this.dispatchEvent(
        new CustomEvent("close", {
          detail: { reason: "close" },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  /**
   * @param {string} [reason]
   */
  #requestClose(reason = "close") {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.dispatchEvent(
      new CustomEvent("close", {
        detail: { reason },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Close the dialog (same as setting `open` to false). */
  close() {
    this.#requestClose("close");
  }

  render() {
    return html`
      <dialog
        part="dialog"
        @cancel=${this.#onCancel}
        @close=${this.#onNativeClose}
      >
        <div class="body" part="body">
          <h2 class="title" part="title"><slot name="title"></slot></h2>
          <div class="content" part="content"><slot></slot></div>
          <div class="actions" part="actions"><slot name="actions"></slot></div>
        </div>
      </dialog>
    `;
  }
}

customElements.define("account-dialog", AccountDialog);
