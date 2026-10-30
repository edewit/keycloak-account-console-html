import { LitElement, html, css, nothing } from "lit";

/**
 * Form control driven by Keycloak user-profile attribute metadata.
 *
 *   <account-input name="email" .attribute=${attr} value="a@b.c"></account-input>
 *
 * Form-associated so values participate in parent `<form>` FormData.
 * Style via `--account-input-*` or ::part(input).
 */
export class AccountInput extends LitElement {
  static formAssociated = true;

  static properties = {
    name: { type: String, reflect: true },
    /** @type {Record<string, unknown> | undefined} */
    attribute: { attribute: false },
    value: { type: String },
    /** @type {string[]} */
    values: { attribute: false },
    disabled: { type: Boolean, reflect: true },
  };

  static styles = css`
    :host {
      --account-input-border: color-mix(in srgb, currentColor 25%, transparent);
      --account-input-radius: 0.35rem;
      --account-input-padding: 0.45rem 0.6rem;

      display: block;
    }

    input,
    select,
    textarea {
      display: block;
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      padding: var(--account-input-padding);
      border: 1px solid var(--account-input-border);
      border-radius: var(--account-input-radius);
      background: transparent;
      color: inherit;
    }

    textarea {
      min-height: 5rem;
      resize: vertical;
    }

    input:disabled,
    select:disabled,
    textarea:disabled {
      opacity: 0.65;
    }
  `;

  /** @type {ElementInternals} */
  #internals;

  constructor() {
    super();
    this.#internals = this.attachInternals();
    this.value = "";
    this.values = [];
    this.disabled = false;
  }

  createRenderRoot() {
    return this.attachShadow({ mode: "open", delegatesFocus: true });
  }

  /**
   * @param {string | undefined} annotated
   * @returns {string}
   */
  #inputType(annotated) {
    if (typeof annotated !== "string" || !annotated) {
      return "text";
    }
    if (
      annotated === "textarea" ||
      annotated === "select" ||
      annotated === "multiselect"
    ) {
      return annotated;
    }
    if (annotated.startsWith("html5-")) {
      return annotated.slice("html5-".length);
    }
    if (annotated.startsWith("html")) {
      return annotated.substring("html".length + 2);
    }
    return annotated;
  }

  /** @returns {string} */
  get #type() {
    return this.#inputType(
      /** @type {any} */ (this.attribute)?.annotations?.inputType,
    );
  }

  /** @returns {string[]} */
  get #options() {
    const options =
      /** @type {any} */ (this.attribute)?.validators?.options?.options;
    return Array.isArray(options) ? options.map(String) : [];
  }

  /** @returns {string[]} */
  get #selectedValues() {
    if (this.values?.length) {
      return this.values.map(String);
    }
    return this.value ? [this.value] : [];
  }

  #syncFormValue() {
    const name = this.name;
    if (!name) {
      this.#internals.setFormValue(null);
      return;
    }
    const selected = this.#selectedValues.filter((v) => v !== "");
    if (selected.length > 1) {
      const data = new FormData();
      for (const entry of selected) {
        data.append(name, entry);
      }
      this.#internals.setFormValue(data);
      return;
    }
    this.#internals.setFormValue(selected[0] ?? "");
  }

  /**
   * @param {Event} event
   */
  #onInput(event) {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.multiple) {
      this.values = [...target.selectedOptions].map((option) => option.value);
      this.value = this.values[0] ?? "";
    } else if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      this.value = target.value;
      this.values = target.value ? [target.value] : [];
    }
    this.#syncFormValue();
  }

  updated() {
    this.#syncFormValue();
  }

  render() {
    const name = this.name ?? "";
    const required = Boolean(/** @type {any} */ (this.attribute)?.required);
    const readOnly =
      Boolean(/** @type {any} */ (this.attribute)?.readOnly) || this.disabled;
    const inputType = this.#type;
    const options = this.#options;
    const value = this.#selectedValues[0] ?? "";
    const values = new Set(this.#selectedValues);
    const placeholder =
      /** @type {any} */ (this.attribute)?.annotations?.inputTypePlaceholder;

    if (inputType === "textarea") {
      return html`
        <textarea
          part="input"
          id=${name}
          name=${name}
          ?required=${required}
          ?disabled=${readOnly}
          .value=${value}
          @input=${this.#onInput}
        ></textarea>
      `;
    }

    if (
      inputType === "select" ||
      inputType === "multiselect" ||
      options.length
    ) {
      const multiple = inputType === "multiselect";
      return html`
        <select
          part="input"
          id=${name}
          name=${name}
          ?required=${required}
          ?disabled=${readOnly}
          ?multiple=${multiple}
          @change=${this.#onInput}
        >
          ${!required && !multiple
            ? html`<option value=""></option>`
            : nothing}
          ${options.map(
            (option) => html`
              <option value=${option} ?selected=${values.has(option)}>
                ${option}
              </option>
            `,
          )}
        </select>
      `;
    }

    return html`
      <input
        part="input"
        id=${name}
        name=${name}
        type=${inputType || "text"}
        .value=${value}
        ?required=${required}
        ?disabled=${readOnly}
        placeholder=${placeholder ?? nothing}
        @input=${this.#onInput}
      />
    `;
  }
}

customElements.define("account-input", AccountInput);
