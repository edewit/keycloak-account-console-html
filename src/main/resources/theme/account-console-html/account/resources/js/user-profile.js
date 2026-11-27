/**
 * Helpers for Keycloak user-profile attribute metadata.
 */

export const ROOT_FIELDS = new Set([
  "username",
  "email",
  "firstName",
  "lastName",
]);

/** Prefix for attribute override slots: `slot="attribute:department"`. */
export const ATTRIBUTE_SLOT_PREFIX = "attribute:";

/**
 * Slot name used to replace a profile attribute control.
 *
 * @param {string} attributeName
 * @returns {string}
 */
export function attributeSlotName(attributeName) {
  return `${ATTRIBUTE_SLOT_PREFIX}${attributeName}`;
}

/**
 * Normalize a form control `name` to a profile field / attribute key.
 * Accepts bare names (`department`) or `attributes.department`.
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeFieldName(name) {
  if (typeof name !== "string") {
    return "";
  }
  return name.startsWith("attributes.")
    ? name.slice("attributes.".length)
    : name;
}

/**
 * @param {string | undefined} annotated
 * @returns {string}
 */
export function resolveInputType(annotated) {
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

/**
 * @param {string} raw
 * @returns {string}
 */
export function displayName(raw) {
  const match = /^\$\{(.+)\}$/.exec(raw);
  if (!match) {
    return raw;
  }
  return match[1]
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Translate a user-profile attribute label (`${email}` → t("email")).
 *
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @param {any} attribute
 * @returns {string}
 */
export function attributeLabel(t, attribute) {
  const raw = attribute?.displayName || attribute?.name || "";
  if (typeof raw !== "string" || !raw) {
    return "";
  }
  const key =
    raw.startsWith("${") && raw.endsWith("}") ? raw.slice(2, -1) : raw;
  const translated = t(key);
  if (translated && translated !== key) {
    return translated;
  }
  return displayName(raw);
}

/**
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @param {unknown} value
 * @returns {string}
 */
function resolveErrorParam(t, value) {
  if (value == null) {
    return "";
  }
  const text = String(value);
  if (text.startsWith("${") && text.endsWith("}")) {
    return t(text.slice(2, -1));
  }
  return text;
}

/**
 * Human-readable language name for a locale tag.
 *
 * @param {string} locale
 * @returns {string}
 */
export function localeDisplayName(locale) {
  try {
    return (
      new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale
    );
  } catch {
    return locale;
  }
}

/**
 * Select options for the locale attribute (default + supported locales).
 *
 * @param {string[]} supportedLocales
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @param {string} [currentLocale]
 * @returns {{ value: string, label: string }[]}
 */
export function localeSelectOptions(supportedLocales, t, currentLocale) {
  const locales = (supportedLocales ?? [])
    .map((locale) => {
      const key = `locale_${locale}`;
      const translated = t(key);
      return {
        value: locale,
        label: translated !== key ? translated : localeDisplayName(locale),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, currentLocale || undefined));

  return [{ value: "", label: t("defaultLocale") }, ...locales];
}

/**
 * Map Keycloak user-profile validation errors to per-field messages.
 *
 * @param {Array<{ field?: string, errorMessage?: string, params?: unknown[] }> | undefined} errors
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {Record<string, string>}
 */
export function userProfileFieldErrors(errors, t) {
  /** @type {Record<string, string[]>} */
  const byField = {};

  for (const entry of errors ?? []) {
    const field = entry?.field;
    const errorMessage = entry?.errorMessage;
    if (!field || !errorMessage) {
      continue;
    }

    const key =
      errorMessage.startsWith("${") && errorMessage.endsWith("}")
        ? errorMessage.slice(2, -1)
        : errorMessage;
    /** @type {Record<string, string>} */
    const params = {};
    (entry.params ?? []).forEach((param, index) => {
      params[String(index)] = resolveErrorParam(t, param);
    });

    const message = t(key, params);
    (byField[field] ??= []).push(message);
  }

  return Object.fromEntries(
    Object.entries(byField).map(([field, messages]) => [
      field,
      [...new Set(messages)].join("; "),
    ]),
  );
}

/**
 * Map a user-profile attribute to primitive `<account-input>` props.
 *
 * @param {any} attribute
 * @param {(key: string, params?: Record<string, string | number>) => string} [t]
 * @returns {{
 *   name: string,
 *   type: string,
 *   required: boolean,
 *   readOnly: boolean,
 *   options: string[],
 *   placeholder: string | undefined,
 *   label: string,
 * }}
 */
export function attributeToInputProps(attribute, t) {
  const options = attribute?.validators?.options?.options;
  return {
    name: attribute.name,
    type: resolveInputType(attribute?.annotations?.inputType),
    required: Boolean(attribute?.required),
    readOnly: Boolean(attribute?.readOnly),
    options: Array.isArray(options) ? options.map(String) : [],
    placeholder:
      typeof attribute?.annotations?.inputTypePlaceholder === "string"
        ? attribute.annotations.inputTypePlaceholder
        : undefined,
    label: t
      ? attributeLabel(t, attribute)
      : displayName(attribute.displayName || attribute.name),
  };
}
