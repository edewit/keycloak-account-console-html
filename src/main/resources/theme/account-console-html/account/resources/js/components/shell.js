import { LitElement, html, css } from "lit";
import "../nav.js";

/**
 * Account console page chrome: sidebar + main content slot.
 *
 *   <account-shell>
 *     <account-personal-info></account-personal-info>
 *   </account-shell>
 *
 * Extra nav links: project into the sidebar via slot="link" on the shell
 * (forwarded), or set `.links` / call `addLink()` on the inner sidebar.
 *
 * Style via `--account-shell-*` / shared tokens, or ::part(layout|nav|main).
 */
export class AccountShell extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: var(--account-font, system-ui, sans-serif);
      line-height: 1.5;
      padding: var(--account-shell-padding, 2rem);
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

  render() {
    return html`
      <div class="layout" part="layout">
        <account-sidebar part="nav">
          <slot name="link" slot="link"></slot>
        </account-sidebar>
        <div class="main" part="main">
          <slot></slot>
        </div>
      </div>
    `;
  }
}

customElements.define("account-shell", AccountShell);
