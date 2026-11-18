import type { Store } from './db.ts';

/**
 * Comercio y cartera. El registro del juego ya no incluye el saldo de aUEC, pero sí las recompensas
 * ("Awarded N aUEC") y cada compra con su precio. Con un saldo que indicas tú una vez, se estima el actual.
 * Las ventas, los alquileres y las transferencias no aparecen en el registro: la estimación lo dice.
 */

export interface Purchase {
  ts: string;
  item: string;
  quantity: number;
  price: number;
  shop: string;
  shopName: string;
  kind: string;
}

export interface Reward {
  ts: string;
  amount: number;
}

/** "SCShop_ConscientiousObjects_Levski-001" → "Conscientious Objects · Levski". */
export function shopName(raw: string): string {
  const parts = raw.replace(/^SCShop_/, '').replace(/-\d+$/, '').split('_').filter((p) => !/^(XS|S|M|L|XL)$/.test(p));
  const words = parts.map((p) => p.replace(/([a-z])([A-Z])/g, '$1 $2'));
  if (words.length > 1) return `${words.slice(0, -1).join(' ')} · ${words.at(-1)}`;
  return words[0] ?? raw;
}

/** Tipo de compra a partir de la clase del objeto. */
export function purchaseKind(item: string): string {
  const s = item.toLowerCase();
  if (/_scitem$|^(cool|shld|powr|qdrv|jdrv|radr|mrck|mount|turret|missile|gats|klwe_massdriver)_/.test(s)) return 'Componentes de nave';
  if (/^(food|drink)_|_food_|_drink_|sachet|mre|burrito|bar_/.test(s)) return 'Comida y bebida';
  if (/consumable|medgun|medpen|healing|vial|oxypen|detox/.test(s)) return 'Medicina';
  if (/_mag$|_magazine|ammo/.test(s)) return 'Munición';
  if (/(rifle|pistol|smg|shotgun|sniper|lmg|glauncher|launcher|gren)/.test(s)) return 'Armas';
  if (/(armor|helmet|undersuit|backpack|_core_|_arms_|_legs_)/.test(s)) return 'Armadura';
  if (/carryable|plant_pot|flair|decor/.test(s)) return 'Decoración';
  if (/(multitool|tractor|mining|salvage|gadget)/.test(s)) return 'Herramientas';
  return 'Otros';
}

export function loadEconomy(store: Store): { purchases: Purchase[]; rewards: Reward[] } {
  const rows = store.db
    .prepare(`SELECT ts, type, data FROM events WHERE type IN ('economy.buy', 'economy.reward') ORDER BY id`)
    .all() as { ts: string; type: string; data: string }[];
  const purchases: Purchase[] = [];
  const rewards: Reward[] = [];
  for (const r of rows) {
    const d = JSON.parse(r.data) as Record<string, unknown>;
    if (r.type === 'economy.reward') {
      const amount = Number(d.amount) || 0;
      if (amount > 0) rewards.push({ ts: r.ts, amount });
    } else {
      const quantity = Number(d.quantity) || 1;
      // client_price ya es el total de la compra (51 botellas a 6 aUEC = 306), no el precio por unidad.
      const price = Number(d.price) || 0;
      const item = String(d.item ?? '');
      purchases.push({ ts: r.ts, item, quantity, price, shop: String(d.shop ?? ''), shopName: shopName(String(d.shop ?? '')), kind: purchaseKind(item) });
    }
  }
  return { purchases, rewards };
}

export interface Wallet {
  /** Saldo que indicaste y cuándo. */
  base: { amount: number; at: string } | null;
  rewardsSince: number;
  spentSince: number;
  estimate: number | null;
}

export function walletEstimate(base: Wallet['base'], purchases: Purchase[], rewards: Reward[]): Wallet {
  if (!base) return { base: null, rewardsSince: 0, spentSince: 0, estimate: null };
  const rewardsSince = rewards.filter((r) => r.ts > base.at).reduce((a, r) => a + r.amount, 0);
  const spentSince = purchases.filter((p) => p.ts > base.at).reduce((a, p) => a + p.price, 0);
  return { base, rewardsSince, spentSince, estimate: base.amount + rewardsSince - spentSince };
}

export function getSetting<T>(store: Store, key: string): T | null {
  const row = store.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

export function setSetting(store: Store, key: string, value: unknown): void {
  store.db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}
