import { LitElement, html, css, nothing } from "lit";

/**
 * Shared account console button.
 *
 *   <account-button>Default</account-button>
 *   <account-button variant="primary">Save</account-button>
 *   <account-button variant="secondary">Share</account-button>
 *   <account-button variant="danger">Remove</account-button>
 *   <account-button variant="danger" filled>Delete</account-button>
 *   <account-button variant="link">Cancel</account-button>
 *
 * `type="submit"` submits the nearest form (shadow buttons are not form-
 * associated). Style via `--account-button-*` or ::part(button).
 */
export class AccountButton extends LitElement {
  static properties = {
    /** @type {"primary" | "secondary" | "danger" | "link"} */
    variant: { type: String, reflect: true },
    /** Filled danger (destructive CTA); ignored for other variants. */
    filled: { type: Boolean, reflect: true },
    type: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    name: { type: String },
    value: { type: String },
  };

  static styles = css`
    :host {
      --account-button-radius: var(--account-radius, 0.5rem);
      --account-button-padding-local: var(
        --account-button-padding,
        0.5rem 1rem
      );
      --account-button-primary-bg: var(
        --account-button-bg,
        light-dark(#1b1b1b, #f0f0f0)
      );
      --account-button-primary-fg: var(
        --account-button-fg,
        light-dark(#fff, #1b1b1b)
      );
      --account-button-danger-color: var(--account-error-color, #b42318);
      --account-button-border: var(
        --account-border-color,
        color-mix(in srgb, currentColor 25%, transparent)
      );

      display: inline-block;
    }

    button {
      box-sizing: border-box;
      font: inherit;
      line-height: 1.4;
      cursor: pointer;
      border: 1px solid var(--account-button-border);
      border-radius: var(--account-button-radius);
      padding: var(--account-button-padding-local);
      background: transparent;
      color: inherit;
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    :host([variant="primary"]) button {
      border-color: transparent;
      background: var(--account-button-primary-bg);
      color: var(--account-button-primary-fg);
    }

    :host([variant="danger"]) button {
      border-color: var(--account-button-danger-color);
      color: var(--account-button-danger-color);
      background: transparent;
    }

    :host([variant="danger"][filled]) button {
      border-color: transparent;
      background: var(--account-button-danger-color);
      color: #fff;
    }

    :host([variant="link"]) button {
      border: none;
      border-radius: 0;
      padding: 0.5rem 0.25rem;
      background: transparent;
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 0.15em;
    }

    :host([variant="link"]) button:disabled {
      text-decoration: none;
    }
  `;

  constructor() {
    super();
    this.variant = "secondary";
    this.filled = false;
    this.type = "button";
    this.disabled = false;
    this.name = "";
    this.value = "";
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.hasAttribute("exportparts")) {
      this.setAttribute("exportparts", "button");
    }
  }

  /**
   * @param {Event} event
   */
  #onClick(event) {
    if (this.disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.type === "submit") {
      event.preventDefault();
      this.closest("form")?.requestSubmit();
    }
  }

  render() {
    return html`
      <button
        part="button"
        type=${this.type === "submit" ? "button" : this.type || "button"}
        name=${this.name || nothing}
        value=${this.value || nothing}
        ?disabled=${this.disabled}
        @click=${this.#onClick}
      >
        <slot></slot>
      </button>
    `;
  }
}

customElements.define("account-button", AccountButton);
