/** Stabilní ID: prefix + čítač + náhodná přípona (v editoru; nikdy se nemění po vytvoření). */
let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  const rnd = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}
