import { LitElement, html, css, nothing } from "lit";
import { getSupportedLocales } from "../api.js";
import { consumeMessages } from "../i18n.js";
import { localeSelectOptions } from "../user-profile.js";
import "./field.js";
import "./input.js";

/**
 * Locale attribute control: dropdown of active realm locales.
 *
 * Intended as a personal-info slot override:
 *
 *   <account-personal-info>
 *     <account-locale-field slot="attribute:locale"></account-locale-field>
 *   </account-personal-info>
 *
 * Loads options from `/supportedLocales`, labels via `locale_<tag>` / Intl,
 * and syncs value / errors / disabled state from the parent
 * `account-personal-info` events.
 */
export class AccountLocaleField extends LitElement {
  static properties = {
    /** @type {string[]} */
    locales: { state: true },
    value: { state: true },
    error: { state: true },
    disabled: { type: Boolean, reflect: true },
    required: { type: Boolean, reflect: true },
    readOnly: { type: Boolean, reflect: true, attribute: "readonly" },
  };

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    account-field,
    account-input {
      width: 100%;
    }
  `;

  #i18n = consumeMessages(this);

  /** @type {HTMLElement | null} */
  #parent = null;

  /** @type {(event: Event) => void} */
  #onParentLoad = () => this.#syncFromParent();

  /** @type {(event: Event) => void} */
  #onParentSave = () => {
    this.disabled = true;
    this.error = "";
  };

  /** @type {(event: Event) => void} */
  #onParentSaved = () => {
    this.disabled = false;
    this.error = "";
    this.#syncFromParent();
  };

  /** @type {(event: Event) => void} */
  #onParentCancel = () => {
    this.disabled = false;
    this.error = "";
    this.#syncFromParent();
  };

  /** @type {(event: CustomEvent) => void} */
  #onParentError = (event) => {
    this.disabled = false;
    const fieldErrors = event.detail?.fieldErrors;
    this.error =
      fieldErrors && typeof fieldErrors.locale === "string"
        ? fieldErrors.locale
        : "";
  };

  constructor() {
    super();
    this.locales = [];
    this.value = "";
    this.error = "";
    this.disabled = false;
    this.required = false;
    this.readOnly = false;
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  get #uiLocale() {
    return this.#i18n.value?.locale || "en";
  }

  connectedCallback() {
    super.connectedCallback();
    this.#parent = this.closest("account-personal-info");
    this.#parent?.addEventListener("load", this.#onParentLoad);
    this.#parent?.addEventListener("save", this.#onParentSave);
    this.#parent?.addEventListener("saved", this.#onParentSaved);
    this.#parent?.addEventListener("cancel", this.#onParentCancel);
    this.#parent?.addEventListener("error", this.#onParentError);
    this.#syncFromParent();
    this.#loadLocales();
  }

  disconnectedCallback() {
    this.#parent?.removeEventListener("load", this.#onParentLoad);
    this.#parent?.removeEventListener("save", this.#onParentSave);
    this.#parent?.removeEventListener("saved", this.#onParentSaved);
    this.#parent?.removeEventListener("cancel", this.#onParentCancel);
    this.#parent?.removeEventListener("error", this.#onParentError);
    this.#parent = null;
    super.disconnectedCallback();
  }

  async #loadLocales() {
    try {
      const locales = await getSupportedLocales();
      this.locales = Array.isArray(locales) ? locales.map(String) : [];
    } catch {
      this.locales = [];
    }
  }

  #syncFromParent() {
    const parent = /** @type {any} */ (this.#parent);
    const user = parent?.user;
    if (!user) {
      return;
    }

    const attrs = /** @type {Record<string, string[] | string>} */ (
      user.attributes ?? {}
    );
    const raw = attrs.locale;
    this.value = Array.isArray(raw)
      ? String(raw[0] ?? "")
      : raw == null
        ? ""
        : String(raw);

    const meta = user.userProfileMetadata?.attributes;
    const attribute = Array.isArray(meta)
      ? meta.find((entry) => entry?.name === "locale")
      : undefined;
    if (attribute) {
      this.required = Boolean(attribute.required);
      this.readOnly = Boolean(attribute.readOnly);
    }
  }

  render() {
    if (!this.locales.length) {
      return nothing;
    }

    const options = localeSelectOptions(this.locales, this.#t, this.#uiLocale);

    return html`
      <account-field
        part="field"
        label=${this.#t("selectALocale")}
        error=${this.error}
        ?required=${this.required}
      >
        <account-input
          part="input"
          id="locale"
          name="locale"
          type="select"
          .options=${options}
          .value=${this.value}
          .values=${this.value ? [this.value] : []}
          ?required=${this.required}
          ?readonly=${this.readOnly}
          ?disabled=${this.disabled}
        ></account-input>
      </account-field>
    `;
  }
}

customElements.define("account-locale-field", AccountLocaleField);
