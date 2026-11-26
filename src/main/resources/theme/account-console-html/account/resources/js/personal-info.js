import { LitElement, html, css, nothing } from "lit";
import { AccountApiError, getPersonalInfo, savePersonalInfo } from "./api.js";
import { consumeMessages } from "./i18n.js";
import {
  emitEvent,
  pageChromeStyles,
  renderLoadError,
  renderLoading,
  renderMessage,
} from "./page.js";
import {
  ROOT_FIELDS,
  attributeSlotName,
  attributeToInputProps,
  normalizeFieldName,
  userProfileFieldErrors,
} from "./user-profile.js";
import "./components/save-button.js";
import "./components/input.js";
import "./components/field.js";

/**
 * Personal info form driven by Keycloak user profile metadata.
 *
 * Default fields come from `user.userProfileMetadata.attributes`. Override any
 * attribute with `slot="attribute:<name>"` (preferred; avoids clashes with
 * `title` / `description` / `actions` / `field`). Bare `slot="<name>"` still
 * works. Append extras with `slot="field"` (include a `name` so the value is
 * saved). Control names may be bare (`department`) or `attributes.department`.
 *
 *   <account-personal-info>
 *     <h1 slot="title">My profile</h1>
 *     <div slot="attribute:department" class="field">
 *       <label for="dept">Department</label>
 *       <select name="attributes.department" id="dept">
 *         <option value="engineering">Engineering</option>
 *         <option value="product">Product</option>
 *       </select>
 *     </div>
 *     <div slot="field" class="field">
 *       <label for="nickname">Nickname</label>
 *       <input id="nickname" name="nickname" />
 *     </div>
 *   </account-personal-info>
 *
 * Events (bubbles, composed): `load`, cancelable `save`, `saved`, `error`.
 *
 * Style via shared tokens / `--account-personal-*` or
 * ::part(form|field|label|input|actions|message).
 */
export class PersonalInfo extends LitElement {
  static properties = {
    /** @type {Record<string, unknown> | undefined} */
    user: { state: true },
    status: { state: true },
    message: { state: true },
    /** @type {"" | "error" | "success"} */
    messageTone: { state: true },
    /** @type {Record<string, string>} */
    fieldErrors: { state: true },
  };

  static styles = [
    pageChromeStyles,
    css`
      :host {
        --account-gap: 1.5rem;
        --account-personal-max-width: var(--account-max-width, 42rem);

        display: block;
        width: 100%;
        max-width: var(--account-personal-max-width);
      }

      form {
        display: flex;
        flex-direction: column;
        gap: var(--account-gap);
        width: 100%;
      }

      .field,
      ::slotted(.field),
      ::slotted([slot="field"]),
      ::slotted([slot^="attribute:"]) {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      account-field,
      account-input {
        width: 100%;
      }

      .actions {
        display: flex;
        gap: 0.75rem;
        align-items: center;
      }
    `,
  ];

  #i18n = consumeMessages(this);

  constructor() {
    super();
    this.status = "loading";
    this.message = "";
    this.messageTone = "";
    this.fieldErrors = {};
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  connectedCallback() {
    super.connectedCallback();
    this.#load();
  }

  async #load() {
    this.status = "loading";
    this.message = "";
    this.messageTone = "";
    this.fieldErrors = {};
    try {
      this.user = await getPersonalInfo();
      if (!this.#attributes().length) {
        throw new Error("User profile metadata is not available");
      }
      this.status = "ready";
      emitEvent(this, "load", this.user);
      this.updateComplete.then(() => this.#hydrateSlottedFields());
    } catch (error) {
      this.status = "error";
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", { phase: "load", error, message: this.message });
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
      const name = normalizeFieldName(el.name);
      if (!name) {
        continue;
      }
      const value = this.#valueOf(name);
      if (el instanceof HTMLSelectElement && el.multiple) {
        const values = new Set(this.#valuesOf(name));
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
    const key = normalizeFieldName(name);
    const user = this.user ?? {};
    if (ROOT_FIELDS.has(key)) {
      const value = user[key];
      return value == null || value === "" ? [] : [String(value)];
    }
    const attrs = /** @type {Record<string, string[] | string>} */ (
      user.attributes ?? {}
    );
    const value = attrs[key];
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
   * @param {HTMLFormElement} form
   */
  #applyFormData(form) {
    const data = new FormData(form);
    const names = new Set(data.keys());
    const user = { ...(this.user ?? {}) };
    const attributes = {
      .../** @type {Record<string, string[]>} */ (user.attributes ?? {}),
    };

    for (const rawName of names) {
      const name = normalizeFieldName(rawName);
      if (!name) {
        continue;
      }
      const values = data.getAll(rawName).map(String).filter((v) => v !== "");
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

    const { userProfileMetadata: _meta, ...payload } = this.user;
    if (!emitEvent(this, "save", { user: this.user, payload }, { cancelable: true })) {
      return;
    }

    this.status = "saving";
    this.message = "";
    this.messageTone = "";
    this.fieldErrors = {};
    try {
      await savePersonalInfo(payload);
      this.user = await getPersonalInfo();
      this.status = "ready";
      this.messageTone = "success";
      this.message = this.#t("accountUpdatedMessage");
      emitEvent(this, "saved", this.user);
      this.updateComplete.then(() => this.#hydrateSlottedFields());
    } catch (error) {
      this.status = "ready";
      const fieldErrors =
        error instanceof AccountApiError && error.errors?.length
          ? userProfileFieldErrors(error.errors, this.#t)
          : {};
      this.fieldErrors = fieldErrors;
      this.messageTone = "error";
      this.message = Object.keys(fieldErrors).length
        ? this.#t("accountUpdatedError")
        : error instanceof Error
          ? error.message
          : String(error);
      emitEvent(this, "error", {
        phase: "save",
        error,
        message: this.message,
        fieldErrors,
      });
    }
  }

  /**
   * @param {any} attribute
   */
  #renderField(attribute) {
    const props = attributeToInputProps(attribute);
    const fieldError = this.fieldErrors[props.name] ?? "";
    const defaultField = html`
      <account-field
        part="field"
        label=${props.label}
        error=${fieldError}
        ?required=${props.required}
      >
        <account-input
          part="input"
          id=${props.name}
          name=${props.name}
          type=${props.type}
          .options=${props.options}
          placeholder=${props.placeholder ?? ""}
          .value=${this.#valueOf(props.name)}
          .values=${this.#valuesOf(props.name)}
          ?required=${props.required}
          ?readonly=${props.readOnly}
          ?disabled=${this.status === "saving"}
        ></account-input>
      </account-field>
    `;
    // Prefer `attribute:<name>` so overrides never collide with title/actions/…
    // Nested bare-name slot keeps older `slot="email"` overrides working.
    return html`
      <slot name=${attributeSlotName(props.name)}>
        <slot name=${props.name}>${defaultField}</slot>
      </slot>
    `;
  }

  render() {
    if (this.status === "loading") {
      return renderLoading("Loading personal info…");
    }

    if (this.status === "error" && !this.user) {
      return renderLoadError(this.message);
    }

    const attributes = this.#attributes();
    const allReadOnly = attributes.every((attribute) => attribute.readOnly);

    return html`
      <slot name="title">
        <h1 part="title">${this.#t("personalInfo")}</h1>
      </slot>
      <slot name="description">
        <p part="description" class="description">
          ${this.#t("personalInfoDescription")}
        </p>
      </slot>
      <form part="form" @submit=${this.#onSubmit}>
        ${attributes.map((attribute) => this.#renderField(attribute))}
        <slot name="field"></slot>
        ${allReadOnly
          ? nothing
          : html`
              <slot name="actions">
                <div class="actions" part="actions">
                  <account-save-button
                    label=${this.#t("save")}
                    ?saving=${this.status === "saving"}
                  ></account-save-button>
                </div>
              </slot>
            `}
        ${renderMessage(this, this.message, this.messageTone)}
      </form>
    `;
  }
}

customElements.define("account-personal-info", PersonalInfo);
