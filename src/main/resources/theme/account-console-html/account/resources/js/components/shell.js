import { LitElement, html, css, nothing } from "lit";
import { ContextProvider } from "@lit/context";
import {
  emptyI18n,
  loadI18n,
  messagesContext,
} from "../i18n.js";
import "../nav.js";
import "./toolbar.js";

/**
 * @typedef {{
 *   toolbar: boolean,
 *   start: boolean,
 *   back: boolean,
 *   end: boolean,
 *   avatar: boolean,
 *   signOut: boolean,
 * }} ShellSlotFlags
 */

/**
 * Account console page chrome: toolbar + sidebar + main content slot.
 *
 * Loads theme messages and provides them via Lit context (`messagesContext`)
 * so descendants can `consumeMessages(this)` and call `.t(key)`.
 *
 *   <account-shell>
 *     <account-personal-info></account-personal-info>
 *   </account-shell>
 *
 * Override chrome via slots:
 *
 *   <account-shell>
 *     <!-- replace the whole toolbar -->
 *     <div slot="toolbar">…</div>
 *     <!-- or replace toolbar pieces (forwarded into account-toolbar) -->
 *     <a slot="back" href="https://app.example">Back to App</a>
 *     <img slot="avatar" src="…" alt="Ada" width="36" height="36" />
 *     <button slot="sign-out" type="button">Log out</button>
 *     <a slot="link" href="help.html">Help</a>
 *     <account-personal-info></account-personal-info>
 *   </account-shell>
 *
 * Only slots that the page actually provides are forwarded. Empty forwarding
 * `<slot>` nodes would otherwise replace toolbar defaults and leave the bar blank.
 *
 * Style via `--account-shell-*` / shared tokens, or
 * ::part(chrome|toolbar|layout|nav|main).
 */
export class AccountShell extends LitElement {
  static properties = {
    /** @type {import('../i18n.js').AccountI18n} */
    i18n: { state: true },
    status: { state: true },
    /** @type {ShellSlotFlags} */
    slotted: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      font-family: var(--account-font, system-ui, sans-serif);
      line-height: 1.5;
      padding: var(--account-shell-padding, 2rem);
    }

    .chrome {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .layout {
      display: grid;
      gap: var(--account-shell-gap, 2rem);
      grid-template-columns: minmax(12rem, var(--account-shell-nav-width, 16rem))
        minmax(0, 1fr);
      align-items: start;
    }

    @media (max-width: 40rem) {
      .layout {
        grid-template-columns: 1fr;
      }
    }

    .main {
      min-width: 0;
    }
  `;

  /** @type {ContextProvider<import('../i18n.js').AccountI18n>} */
  #messagesProvider;

  /** @type {MutationObserver | undefined} */
  #childObserver;

  constructor() {
    super();
    this.i18n = emptyI18n();
    this.status = "loading";
    this.slotted = {
      toolbar: false,
      start: false,
      back: false,
      end: false,
      avatar: false,
      signOut: false,
    };
    this.#messagesProvider = new ContextProvider(this, {
      context: messagesContext,
      initialValue: this.i18n,
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this.#measureSlots();
    this.#childObserver = new MutationObserver(() => this.#measureSlots());
    this.#childObserver.observe(this, {
      childList: true,
      attributes: true,
      attributeFilter: ["slot"],
      subtree: true,
    });
    this.#loadMessages();
  }

  disconnectedCallback() {
    this.#childObserver?.disconnect();
    this.#childObserver = undefined;
    super.disconnectedCallback();
  }

  #measureSlots() {
    this.slotted = {
      toolbar: Boolean(this.querySelector(':scope > [slot="toolbar"]')),
      start: Boolean(this.querySelector(':scope > [slot="start"]')),
      back: Boolean(this.querySelector(':scope > [slot="back"]')),
      end: Boolean(this.querySelector(':scope > [slot="end"]')),
      avatar: Boolean(this.querySelector(':scope > [slot="avatar"]')),
      signOut: Boolean(this.querySelector(':scope > [slot="sign-out"]')),
    };
  }

  async #loadMessages() {
    this.status = "loading";
    try {
      this.i18n = await loadI18n();
      this.#messagesProvider.setValue(this.i18n);
    } catch (error) {
      console.warn("Failed to load account messages", error);
      this.i18n = emptyI18n();
      this.#messagesProvider.setValue(this.i18n);
    } finally {
      this.status = "ready";
    }
  }

  /**
   * Forward a named slot into account-toolbar only when the page provided it.
   * @param {keyof ShellSlotFlags} flag
   * @param {string} slotName
   */
  #forward(flag, slotName) {
    if (!this.slotted[flag]) {
      return nothing;
    }
    return html`<slot name=${slotName} slot=${slotName}></slot>`;
  }

  render() {
    if (this.status === "loading") {
      return html`<p part="message">Loading…</p>`;
    }

    return html`
      <div class="chrome" part="chrome">
        <slot name="toolbar"></slot>
        ${this.slotted.toolbar
          ? nothing
          : html`
              <account-toolbar part="toolbar">
                ${this.#forward("start", "start")}
                ${this.#forward("back", "back")}
                ${this.#forward("end", "end")}
                ${this.#forward("avatar", "avatar")}
                ${this.#forward("signOut", "sign-out")}
              </account-toolbar>
            `}
        <div class="layout" part="layout">
          <account-sidebar part="nav">
            <slot name="link" slot="link"></slot>
          </account-sidebar>
          <div class="main" part="main">
            <slot></slot>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define("account-shell", AccountShell);
