/** Each section keeps English and Turkish side by side; tsc rejects missing keys. */
export function section<T extends object>(s: { en: T; tr: NoInfer<T> }): { en: T; tr: T } {
  return s;
}
