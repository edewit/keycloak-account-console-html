import { LitElement, html, css } from "lit";
import "./button.js";

/**
 * Submit button with a built-in saving state (wraps {@link AccountButton}).
 *
 *   <account-save-button></account-save-button>
 *   <account-save-button saving></account-save-button>
 *   <account-save-button label="Update" saving-label="Updating…"></account-save-button>
 *
 * Style via shared `--account-button-*` tokens or ::part(button).
 */
export class SaveButton extends LitElement {
  static properties = {
    saving: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    label: { type: String },
    savingLabel: { type: String, attribute: "saving-label" },
  };

  static styles = css`
    :host {
      display: inline-block;
    }
  `;

  constructor() {
    super();
    this.saving = false;
    this.disabled = false;
    this.label = "Save";
    this.savingLabel = "Saving…";
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.hasAttribute("exportparts")) {
      this.setAttribute("exportparts", "button");
    }
  }

  /**
   * Shadow-DOM buttons are not form-associated; submit the nearest form instead.
   */
  #onClick() {
    if (this.disabled || this.saving) {
      return;
    }
    this.closest("form")?.requestSubmit();
  }

  render() {
    return html`
      <account-button
        variant="primary"
        exportparts="button"
        ?disabled=${this.disabled || this.saving}
        @click=${this.#onClick}
      >
        ${this.saving ? this.savingLabel : this.label}
      </account-button>
    `;
  }
}

customElements.define("account-save-button", SaveButton);
