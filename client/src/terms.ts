/**
 * Términos del juego en los dos idiomas. EN: como en el juego en inglés.
 * ES: como habla la comunidad hispana; lo que se dice en inglés (MedPen, undersuit, QT, SCU, aUEC, ASOP) se queda en inglés.
 * Los nombres propios (sitios, naves, objetos, facciones, criaturas) no están aquí: nunca se traducen.
 */

export type Term = { en: string; es: string };

export const GEAR_PORT: Record<string, Term> = {
  Armor_Helmet: { en: 'Helmet', es: 'Casco' },
  Armor_Torso: { en: 'Core', es: 'Torso' },
  Armor_Arms: { en: 'Arms', es: 'Brazos' },
  Armor_Legs: { en: 'Legs', es: 'Piernas' },
  Armor_Undersuit: { en: 'Undersuit', es: 'Undersuit' },
  Armor_Backpack: { en: 'Backpack', es: 'Mochila' },
  Backpack: { en: 'Backpack', es: 'Mochila' },
  wep_sidearm: { en: 'Sidearm', es: 'Pistola' },
  back: { en: 'Back', es: 'Espalda' },
  medpen: { en: 'MedPen', es: 'MedPen' },
  grenade: { en: 'Grenade', es: 'Granada' },
};

export const GEAR_GROUP: Record<string, Term> = {
  armor: { en: 'Armor', es: 'Armadura' },
  weapons: { en: 'Weapons', es: 'Armas' },
  utility: { en: 'Backpack & consumables', es: 'Mochila y consumibles' },
};

export const COMPONENT: Record<string, Term> = {
  Shield: { en: 'Shield', es: 'Escudo' },
  PowerPlant: { en: 'Power Plant', es: 'Planta de energía' },
  Cooler: { en: 'Cooler', es: 'Refrigerador' },
  QuantumDrive: { en: 'Quantum Drive', es: 'Motor cuántico' },
  WeaponGun: { en: 'Weapon', es: 'Arma' },
  Turret: { en: 'Turret', es: 'Torreta' },
  MissileLauncher: { en: 'Missile Rack', es: 'Lanzamisiles' },
  Radar: { en: 'Radar', es: 'Radar' },
};

export const BODY_PART: Record<string, Term> = {
  Head: { en: 'Head', es: 'Cabeza' },
  Torso: { en: 'Torso', es: 'Torso' },
  'Left arm': { en: 'Left Arm', es: 'Brazo izquierdo' },
  'Right arm': { en: 'Right Arm', es: 'Brazo derecho' },
  'Left leg': { en: 'Left Leg', es: 'Pierna izquierda' },
  'Right leg': { en: 'Right Leg', es: 'Pierna derecha' },
};

export const SEVERITY: Record<string, Term> = {
  Minor: { en: 'Minor', es: 'leve' },
  Moderate: { en: 'Moderate', es: 'moderada' },
  Severe: { en: 'Severe', es: 'grave' },
};

export const MISSION_KIND: Record<string, Term> = {
  caza: { en: 'Bounty Hunting', es: 'Cazarrecompensas' },
  mercenario: { en: 'Mercenary', es: 'Mercenario' },
  fps: { en: 'FPS Combat', es: 'Combate FPS' },
  transporte: { en: 'Hauling', es: 'Transporte de carga' },
  recuperacion: { en: 'Recovery', es: 'Recuperación' },
  recoleccion: { en: 'Mining & Gathering', es: 'Minería y recolección' },
  infiltracion: { en: 'Investigation', es: 'Investigación' },
  evento: { en: 'Events', es: 'Eventos' },
  otros: { en: 'Other', es: 'Otros' },
};

export const MEDBED: Term = { en: 'Med Bed', es: 'cama médica' };
