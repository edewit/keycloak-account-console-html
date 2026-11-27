import { LitElement, html, css, nothing } from "lit";
import {
  AccountApiError,
  getEnvironment,
  getKeycloak,
  getPersonalInfo,
  savePersonalInfo,
} from "./api.js";
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
import "./components/button.js";
import "./components/input.js";
import "./components/field.js";

/**
 * @param {unknown} value
 * @returns {any}
 */
function cloneUser(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

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
 *     <account-locale-field slot="attribute:locale"></account-locale-field>
 *     <div slot="attribute:department" class="field">
 *       <label for="dept">Department</label>
 *       <select name="attributes.department" id="dept">
 *         <option value="engineering">Engineering</option>
 *         <option value="product">Product</option>
 *       </select>
 *     </div>
 *   </account-personal-info>
 *
 * When enabled by realm features: Update email (UPDATE_EMAIL), Delete account
 * (`delete_account`), and Cancel resets to the last loaded/saved values.
 *
 * Events (bubbles, composed): `load`, cancelable `save` / `cancel` /
 * `update-email` / `delete-account`, `saved`, `error`.
 *
 * Style via shared tokens / `--account-personal-*` or
 * ::part(form|field|label|input|actions|update-email|delete-account|message).
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
    /** @type {Record<string, boolean>} */
    features: { state: true },
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
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
      }

      .update-email {
        align-self: flex-start;
        margin-top: -0.5rem;
      }

      .delete-account {
        margin-top: 0.5rem;
        border: 1px solid var(--account-border-color, currentColor);
        border-radius: var(--account-radius, 0.5rem);
        padding: 0.75rem 1rem;
      }

      .delete-account summary {
        cursor: pointer;
        font-weight: 600;
      }

      .delete-body {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-top: 0.75rem;
      }

      .delete-body p {
        margin: 0;
        color: var(--account-muted-color, currentColor);
      }

      .delete-body account-button {
        align-self: flex-start;
      }
    `,
  ];

  #i18n = consumeMessages(this);

  /** @type {Record<string, unknown> | undefined} */
  #snapshot;

  constructor() {
    super();
    this.status = "loading";
    this.message = "";
    this.messageTone = "";
    this.fieldErrors = {};
    this.features = {};
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  connectedCallback() {
    super.connectedCallback();
    this.#load();
  }

  /**
   * @param {Record<string, unknown> | undefined} user
   */
  #remember(user) {
    this.#snapshot = cloneUser(user);
  }

  async #load() {
    this.status = "loading";
    this.message = "";
    this.messageTone = "";
    this.fieldErrors = {};
    try {
      const [user, env] = await Promise.all([
        getPersonalInfo(),
        getEnvironment(),
      ]);
      this.user = user;
      this.features =
        env?.features && typeof env.features === "object" ? env.features : {};
      this.#remember(this.user);
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

  #onCancel() {
    if (!this.#snapshot || this.status === "saving") {
      return;
    }
    this.user = cloneUser(this.#snapshot);
    this.fieldErrors = {};
    this.message = "";
    this.messageTone = "";
    this.status = "ready";
    emitEvent(this, "cancel", this.user);
    this.updateComplete.then(() => this.#hydrateSlottedFields());
  }

  /**
   * @param {any} attribute
   */
  #canUpdateEmail(attribute) {
    if (attribute?.name !== "email") {
      return false;
    }
    const features = this.features ?? {};
    const annotations = attribute.annotations ?? {};
    return (
      Boolean(features.updateEmailFeatureEnabled) &&
      Boolean(features.updateEmailActionEnabled) &&
      Boolean(annotations["kc.required.action.supported"]) &&
      (!features.isRegistrationEmailAsUsername ||
        Boolean(features.isEditUserNameAllowed))
    );
  }

  async #updateEmail() {
    if (
      !emitEvent(this, "update-email", {}, { cancelable: true })
    ) {
      return;
    }
    try {
      const keycloak = await getKeycloak();
      await keycloak.login({ action: "UPDATE_EMAIL" });
    } catch (error) {
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "update-email",
        error,
        message: this.message,
      });
    }
  }

  async #deleteAccount() {
    if (
      !emitEvent(this, "delete-account", {}, { cancelable: true })
    ) {
      return;
    }
    try {
      const keycloak = await getKeycloak();
      await keycloak.login({ action: "delete_account" });
    } catch (error) {
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "delete-account",
        error,
        message: this.message,
      });
    }
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
    const localeBefore = this.#valueOf("locale");
    try {
      await savePersonalInfo(payload);
      try {
        const keycloak = await getKeycloak();
        await keycloak.updateToken();
      } catch {
        // Token refresh is best-effort; save already succeeded.
      }
      this.user = await getPersonalInfo();
      this.#remember(this.user);
      const localeAfter = this.#valueOf("locale");
      if (localeAfter !== localeBefore) {
        window.dispatchEvent(
          new CustomEvent("languageChanged", {
            detail: { language: localeAfter },
          }),
        );
        location.reload();
        return;
      }
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
    const props = attributeToInputProps(attribute, this.#t);
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
      ${this.#canUpdateEmail(attribute)
        ? html`
            <account-button
              class="update-email"
              variant="link"
              exportparts="button:update-email"
              ?disabled=${this.status === "saving"}
              @click=${() => this.#updateEmail()}
            >
              ${this.#t("updateEmail")}
            </account-button>
          `
        : nothing}
    `;
    // Prefer `attribute:<name>` so overrides never collide with title/actions/…
    // Nested bare-name slot keeps older `slot="email"` overrides working.
    return html`
      <slot name=${attributeSlotName(props.name)}>
        <slot name=${props.name}>${defaultField}</slot>
      </slot>
    `;
  }

  #renderDeleteAccount() {
    if (!this.features?.deleteAccountAllowed) {
      return nothing;
    }
    return html`
      <details class="delete-account" part="delete-account">
        <summary>${this.#t("deleteAccount")}</summary>
        <div class="delete-body">
          <p>${this.#t("deleteAccountWarning")}</p>
          <account-button
            variant="danger"
            filled
            ?disabled=${this.status === "saving"}
            @click=${() => this.#deleteAccount()}
          >
            ${this.#t("delete")}
          </account-button>
        </div>
      </details>
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
                  <account-button
                    variant="link"
                    exportparts="button:cancel"
                    ?disabled=${this.status === "saving"}
                    @click=${() => this.#onCancel()}
                  >
                    ${this.#t("cancel")}
                  </account-button>
                </div>
              </slot>
            `}
        ${this.#renderDeleteAccount()}
        ${renderMessage(this, this.message, this.messageTone)}
      </form>
    `;
  }
}

customElements.define("account-personal-info", PersonalInfo);
