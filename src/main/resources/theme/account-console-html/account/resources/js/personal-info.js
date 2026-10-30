import { LitElement, html, css, nothing } from "lit";
import { getPersonalInfo, savePersonalInfo } from "./api.js";
import "./components/save-button.js";
import "./components/input.js";

const ROOT_FIELDS = new Set(["username", "email", "firstName", "lastName"]);

/**
 * Personal info form driven by Keycloak user profile metadata.
 *
 * Default fields come from `user.userProfileMetadata.attributes`. Override any
 * attribute by projecting into a slot named after the attribute, or append
 * extra fields with `slot="field"` (use a `name` so the value is saved):
 *
 *   <account-personal-info>
 *     <div slot="email" class="field">
 *       <label for="email">Work email</label>
 *       <input id="email" name="email" type="email" />
 *     </div>
 *     <div slot="field" class="field">
 *       <label for="department">Department</label>
 *       <input id="department" name="department" />
 *     </div>
 *   </account-personal-info>
 *
 * After load, `user` is set and a `load` event is dispatched with the user in
 * `detail` so slotted controls can fill their values.
 *
 * Style via `--account-personal-*` or ::part(form|field|label|input|actions|message).
 */
export class PersonalInfo extends LitElement {
  static properties = {
    /** @type {Record<string, unknown> | undefined} */
    user: { state: true },
    status: { state: true },
    message: { state: true },
    /** @type {"" | "error" | "success"} */
    messageTone: { state: true },
  };

  static styles = css`
    :host {
      --account-personal-gap: 1rem;
      --account-personal-label-color: color-mix(
        in srgb,
        currentColor 70%,
        transparent
      );
      --account-personal-max-width: 28rem;
      --account-personal-error-color: #b42318;
      --account-personal-success-color: #027a48;

      display: block;
      max-width: var(--account-personal-max-width);
    }

    h1 {
      margin: 0 0 0.35rem;
      font-size: 1.5rem;
    }

    .description {
      margin: 0 0 var(--account-personal-gap);
      color: var(--account-personal-label-color);
    }

    form {
      display: flex;
      flex-direction: column;
      gap: var(--account-personal-gap);
    }

    .field,
    ::slotted(.field),
    ::slotted([slot="field"]) {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    label {
      color: var(--account-personal-label-color);
      font-size: 0.9rem;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .message {
      margin: 0;
      font-size: 0.9rem;
    }

    .message[data-tone="error"] {
      color: var(--account-personal-error-color);
    }

    .message[data-tone="success"] {
      color: var(--account-personal-success-color);
    }
  `;

  constructor() {
    super();
    this.status = "loading";
    this.message = "";
    this.messageTone = "";
  }

  connectedCallback() {
    super.connectedCallback();
    this.#load();
  }

  async #load() {
    this.status = "loading";
    this.message = "";
    this.messageTone = "";
    try {
      this.user = await getPersonalInfo();
      if (!this.#attributes().length) {
        throw new Error("User profile metadata is not available");
      }
      this.status = "ready";
      this.dispatchEvent(
        new CustomEvent("load", {
          detail: this.user,
          bubbles: true,
          composed: true,
        }),
      );
      this.updateComplete.then(() => this.#hydrateSlottedFields());
    } catch (error) {
      this.status = "error";
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
    }
  }

  /** @returns {any[]} */
  #attributes() {
    const metadata = this.user?.userProfileMetadata?.attributes;
    return Array.isArray(metadata) ? metadata : [];
  }

  /**
   * Fill slotted inputs that share a profile attribute (or custom) name.
   */
  #hydrateSlottedFields() {
    for (const el of this.querySelectorAll("[name]")) {
      if (
        !(
          el instanceof HTMLInputElement ||
          el instanceof HTMLSelectElement ||
          el instanceof HTMLTextAreaElement
        )
      ) {
        continue;
      }
      const value = this.#valueOf(el.name);
      if (el instanceof HTMLSelectElement && el.multiple) {
        const values = new Set(this.#valuesOf(el.name));
        for (const option of el.options) {
          option.selected = values.has(option.value);
        }
      } else {
        el.value = value;
      }
    }
  }

  /**
   * @param {string} name
   * @returns {string[]}
   */
  #valuesOf(name) {
    const user = this.user ?? {};
    if (ROOT_FIELDS.has(name)) {
      const value = user[name];
      return value == null || value === "" ? [] : [String(value)];
    }
    const attrs = /** @type {Record<string, string[] | string>} */ (
      user.attributes ?? {}
    );
    const value = attrs[name];
    if (Array.isArray(value)) {
      return value.map(String);
    }
    return value == null || value === "" ? [] : [String(value)];
  }

  /**
   * @param {string} name
   * @returns {string}
   */
  #valueOf(name) {
    return this.#valuesOf(name)[0] ?? "";
  }

  /**
   * @param {string} raw
   */
  #displayName(raw) {
    const match = /^\$\{(.+)\}$/.exec(raw);
    if (!match) {
      return raw;
    }
    return match[1]
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase());
  }

  /**
   * @param {HTMLFormElement} form
   */
  #applyFormData(form) {
    const data = new FormData(form);
    const names = new Set(data.keys());
    const user = { ...(this.user ?? {}) };
    const attributes = {
      .../** @type {Record<string, string[]>} */ (user.attributes ?? {}),
    };

    for (const name of names) {
      const values = data.getAll(name).map(String).filter((v) => v !== "");
      if (ROOT_FIELDS.has(name)) {
        user[name] = values[0] ?? "";
      } else {
        attributes[name] = values;
      }
    }

    user.attributes = attributes;
    this.user = user;
  }

  /**
   * @param {Event} event
   */
  async #onSubmit(event) {
    event.preventDefault();
    if (!this.user || this.status === "saving") {
      return;
    }
    this.#applyFormData(/** @type {HTMLFormElement} */ (event.target));

    this.status = "saving";
    this.message = "";
    this.messageTone = "";
    try {
      const { userProfileMetadata: _meta, ...payload } = this.user;
      await savePersonalInfo(payload);
      this.user = await getPersonalInfo();
      this.status = "ready";
      this.messageTone = "success";
      this.message = "Account updated.";
      this.updateComplete.then(() => this.#hydrateSlottedFields());
    } catch (error) {
      this.status = "ready";
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * @param {any} attribute
   */
  #renderField(attribute) {
    const label = this.#displayName(attribute.displayName || attribute.name);
    return html`
      <slot name=${attribute.name}>
        <div class="field" part="field">
          <label part="label" for=${attribute.name}
            >${label}${attribute.required ? html` *` : nothing}</label
          >
          <account-input
            part="input"
            id=${attribute.name}
            name=${attribute.name}
            .attribute=${attribute}
            .value=${this.#valueOf(attribute.name)}
            .values=${this.#valuesOf(attribute.name)}
            ?disabled=${this.status === "saving"}
          ></account-input>
        </div>
      </slot>
    `;
  }

  render() {
    if (this.status === "loading") {
      return html`<p part="message" class="message">Loading personal info…</p>`;
    }

    if (this.status === "error" && !this.user) {
      return html`
        <p part="message" class="message" data-tone="error">${this.message}</p>
      `;
    }

    const attributes = this.#attributes();
    const allReadOnly = attributes.every((attribute) => attribute.readOnly);

    return html`
      <h1 part="title">Personal info</h1>
      <p part="description" class="description">
        Manage your basic information
      </p>
      <form part="form" @submit=${this.#onSubmit}>
        ${attributes.map((attribute) => this.#renderField(attribute))}
        <slot name="field"></slot>
        ${allReadOnly
          ? nothing
          : html`
              <div class="actions" part="actions">
                <account-save-button
                  ?saving=${this.status === "saving"}
                ></account-save-button>
              </div>
            `}
        ${this.message
          ? html`<p
              part="message"
              class="message"
              data-tone=${this.messageTone}
            >
              ${this.message}
            </p>`
          : nothing}
      </form>
    `;
  }
}

customElements.define("account-personal-info", PersonalInfo);
