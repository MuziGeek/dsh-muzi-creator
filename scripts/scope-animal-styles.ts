/** Keep the library's defaults and component selectors inside Muzi roots and portals. */
export function scopeAnimalStyles(css: string): string {
  const components = css.replace(/@font-face\s*\{[^}]*\}/g, "")
    .replace(/--animal-font-family\s*:[^;{}]+;?/g, "");
  return `@scope ([data-plugin="dsh-muzi-creator"], [data-plugin-modal="dsh-muzi-creator"]) {\n${components.replaceAll(":root", ":where(:scope)")}\n}`;
}
