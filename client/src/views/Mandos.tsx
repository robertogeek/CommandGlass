import {
  Check, ChevronLeft, Crosshair, Keyboard, Lock, MessageSquare, Pickaxe, Rocket, Search, Target, User, Wrench, X,
  type LucideIcon,
} from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import logo from '../assets/space-cowboys.png';
import { hhmm } from '../format.ts';
import { tr, useLang } from '../lang.tsx';
import { getJson, useLive } from '../live.tsx';
import type { BoundAction, ControlsResponse, SendResult } from '../types.ts';

/**
 * Mandos: un panel de control a pantalla completa por situación de juego (nave, combate, a pie, minería,
 * chatarreo, social). Cada modo tiene una fila de conmutadores rápidos, un control central y dos grupos a
 * los lados; abajo, una barra fija con lo que se usa siempre y la emergencia tras una tapa.
 *
 * Los botones muestran el nombre oficial de la acción en el idioma elegido (sin las coletillas de modo
 * como «(alternar)»), nunca la tecla: la tecla sale de los controles del jugador y la pulsa el PC.
 * Ver docs en client/DESIGN.md, sección Mandos.
 */

type Bi = { es: string; en: string };
type Tone = 'accent' | 'green' | 'red' | 'amber' | 'violet';
type ModeId = 'nave' | 'combate' | 'pie' | 'mineria' | 'chatarreo' | 'social';

interface Btn {
  /** Acción del juego, "mapa.acción". */
  id: string;
  tone?: Tone;
  big?: boolean;
  /** Acción delicada: tapa + mantener 1,5 s. */
  danger?: boolean;
  /** Ocupa toda la fila de su rejilla. */
  wide?: boolean;
}

interface Group { kind: 'grid'; title: Bi; cols: number; buttons: Btn[] }
interface Tracks { kind: 'tracks'; title: Bi; tracks: { label: Bi; plus: string; minus: string }[]; reset: string }
type Side = Group | Tracks;
type HeroKind = 'quantum' | 'target' | 'wheel' | 'laser' | 'salvage' | 'invite';

interface Mode {
  id: ModeId;
  label: Bi;
  icon: LucideIcon;
  hero: HeroKind;
  top: Btn[];
  left: Side[];
  right: Side[];
  /** Fila bajo el control central. */
  row: Btn[];
}

const b = (id: string, o?: Omit<Btn, 'id'>): Btn => ({ id, ...o });
const grid = (title: Bi, cols: number, buttons: Btn[]): Group => ({ kind: 'grid', title, cols, buttons });

const MOVE = 'spaceship_movement.';
const POWER = 'spaceship_power.';
const TARGET = 'spaceship_targeting.';
const SALV = 'spaceship_salvage.';
const MINING = 'spaceship_mining.';
const EMOTE = 'player_emotes.';

const MODES: Mode[] = [
  {
    id: 'nave', label: { es: 'Nave', en: 'Ship' }, icon: Rocket, hero: 'quantum',
    top: [b(MOVE + 'v_ifcs_vector_decoupling_toggle'), b(MOVE + 'v_vtol_toggle'), b(MOVE + 'v_toggle_landing_system'),
      b('lights_controller.v_lights'), b('spaceship_general.v_toggle_all_portlocks'), b('spaceship_target_hailing.v_target_hail')],
    left: [
      grid({ es: 'Aterrizaje', en: 'Landing' }, 2, [b(MOVE + 'v_atc_request'), b(MOVE + 'v_autoland'), b(MOVE + 'v_atc_loading_area_request'), b('spaceship_docking.v_toggle_docking_request')]),
      grid({ es: 'Escáner', en: 'Scanner' }, 2, [b('seat_general.v_toggle_scan_mode'), b('spaceship_radar.v_invoke_ping')]),
    ],
    right: [
      grid({ es: 'Sistemas', en: 'Systems' }, 2, [b('spaceship_general.v_flightready', { tone: 'accent' }), b(POWER + 'v_power_toggle'), b('seat_general.v_light_amplification_toggle'), b('default.pl_exit')]),
      grid({ es: 'Cabina', en: 'Cockpit' }, 2, [b('spaceship_hud.visor_wipe'), b(TARGET + 'v_look_ahead_enable')]),
    ],
    row: [b(MOVE + 'v_master_mode_cycle_long'), b('vehicle_mfd.v_mfd_interact_cycle_forwards_short')],
  },
  {
    id: 'combate', label: { es: 'Combate', en: 'Combat' }, icon: Crosshair, hero: 'target',
    top: [b('spaceship_weapons.v_weapon_gimbals_state_toggle'), b('spaceship_weapons.v_weapon_aim_type_cycle'), b(MOVE + 'v_ifcs_vector_decoupling_toggle'),
      b(POWER + 'v_power_toggle_shields'), b(POWER + 'v_power_toggle_weapons'), b('seat_general.v_light_amplification_toggle')],
    left: [{
      kind: 'tracks', title: { es: 'Energía', en: 'Power' },
      tracks: [
        { label: { es: 'Armas', en: 'Weapons' }, plus: POWER + 'v_engineering_assignment_weapons_increase', minus: POWER + 'v_engineering_assignment_weapons_decrease' },
        { label: { es: 'Motores', en: 'Engines' }, plus: POWER + 'v_engineering_assignment_engine_increase', minus: POWER + 'v_engineering_assignment_engine_decrease' },
        { label: { es: 'Escudos', en: 'Shields' }, plus: POWER + 'v_engineering_assignment_shields_increase', minus: POWER + 'v_engineering_assignment_shields_decrease' },
      ],
      reset: POWER + 'v_engineering_assignment_reset',
    }],
    right: [
      grid({ es: 'Contramedidas', en: 'Countermeasures' }, 1, [b('spaceship_defensive.v_weapon_countermeasure_decoy_launch', { tone: 'amber', big: true }), b('spaceship_defensive.v_weapon_countermeasure_noise_launch', { tone: 'amber' })]),
      grid({ es: 'Ráfaga de señuelos', en: 'Decoy burst' }, 2, [b('spaceship_defensive.v_weapon_countermeasure_decoy_burst_increase'), b('spaceship_defensive.v_weapon_countermeasure_decoy_burst_decrease')]),
    ],
    row: [b(TARGET + 'v_target_unlock'), b(TARGET + 'v_target_remove_all_pins')],
  },
  {
    id: 'pie', label: { es: 'A pie', en: 'On foot' }, icon: User, hero: 'wheel',
    top: [b('player.toggle_lowered'), b('player.weapon_change_firemode'), b('player.customize'), b('player_choice.pc_pit_inventory'),
      b('player.thirdperson'), b('player.free_thirdperson_camera')],
    left: [
      grid({ es: 'Equipo', en: 'Gear' }, 2, [b('player.toggleAttachHelmet'), b('player.toggle_flashlight'), b('player.visor_wipe'), b('player_choice.pc_interaction_mode')]),
      grid({ es: 'Mira', en: 'Sights' }, 2, [b('player.weapon_zeroing_increase'), b('player.weapon_zeroing_decrease')]),
    ],
    right: [
      grid({ es: 'Supervivencia', en: 'Survival' }, 2, [b('player_choice.pc_qs_consumables', { tone: 'green' }), b('player_choice.pc_qs_grenades'), b('player_choice.pc_personal_thought'), b('player.ammoRepool')]),
      grid({ es: 'Señales', en: 'Signals' }, 2, [b(EMOTE + 'emote_cs_forward'), b(EMOTE + 'emote_cs_stop'), b(EMOTE + 'emote_cs_yes'), b(EMOTE + 'emote_cs_no')]),
    ],
    row: [],
  },
  {
    id: 'mineria', label: { es: 'Minería', en: 'Mining' }, icon: Pickaxe, hero: 'laser',
    top: [b('seat_general.v_cycle_industrial_mode', { tone: 'accent' }), b(MOVE + 'v_toggle_landing_system'), b(MOVE + 'v_vtol_toggle'),
      b(MOVE + 'v_ifcs_vector_decoupling_toggle'), b(MOVE + 'v_autoland'), b('spaceship_general.v_toggle_all_portlocks')],
    left: [
      grid({ es: 'Escáner', en: 'Scanner' }, 2, [b('seat_general.v_toggle_scan_mode'), b('spaceship_radar.v_invoke_ping'), b('player_choice.pc_pit_miningmode_actions'), b('lights_controller.v_lights')]),
      grid({ es: 'Carga', en: 'Cargo' }, 1, [b(MINING + 'v_jettison_volatile_cargo', { danger: true })]),
    ],
    right: [
      grid({ es: 'Módulos', en: 'Modules' }, 2, [b(MINING + 'v_mining_use_consumable1', { tone: 'violet', big: true }), b(MINING + 'v_mining_use_consumable2', { tone: 'violet', big: true }),
        b(MINING + 'v_mining_use_consumable3', { tone: 'violet', big: true }), b(MINING + 'v_mining_use_permanent_modifier')]),
    ],
    row: [],
  },
  {
    id: 'chatarreo', label: { es: 'Chatarreo', en: 'Salvage' }, icon: Wrench, hero: 'salvage',
    top: [b('seat_general.v_cycle_industrial_mode', { tone: 'accent' }), b(SALV + 'v_salvage_toggle_gimbal_mode'), b(SALV + 'v_salvage_reset_gimbal'),
      b(MOVE + 'v_toggle_landing_system'), b(MOVE + 'v_vtol_toggle'), b(MOVE + 'v_ifcs_vector_decoupling_toggle')],
    left: [
      grid({ es: 'Separación de rayos', en: 'Beam spacing' }, 2, [b(SALV + 'v_salvage_decrease_beam_spacing'), b(SALV + 'v_salvage_increase_beam_spacing'), b(SALV + 'v_salvage_toggle_beam_spacing_axis', { wide: true })]),
    ],
    right: [
      grid({ es: 'Rayo tractor', en: 'Tractor beam' }, 2, [b(SALV + 'tractor_beam_vehicle_decrease_distance'), b(SALV + 'tractor_beam_vehicle_increase_distance')]),
      grid({ es: 'Escáner', en: 'Scanner' }, 2, [b('seat_general.v_toggle_scan_mode'), b('spaceship_radar.v_invoke_ping')]),
    ],
    row: [b(SALV + 'v_salvage_focus_all_heads'), b(SALV + 'v_salvage_focus_left'), b(SALV + 'v_salvage_focus_right'), b(SALV + 'v_salvage_focus_fracture')],
  },
  {
    id: 'social', label: { es: 'Social', en: 'Social' }, icon: MessageSquare, hero: 'invite',
    top: [b('default.toggle_chat'), b('default.focus_on_chat_textinput'), b('default.cycle_chat_lobby'), b('spaceship_target_hailing.v_target_hail'),
      b('player.thirdperson'), b('player.free_thirdperson_camera')],
    left: [
      grid({ es: 'Gestos', en: 'Emotes' }, 3, [b(EMOTE + 'emote_wave'), b(EMOTE + 'emote_salute'), b(EMOTE + 'emote_clap'), b(EMOTE + 'emote_point'), b(EMOTE + 'emote_come'), b(EMOTE + 'emote_wait')]),
    ],
    right: [
      // Cruceta: huecos vacíos (id '') para colocar cada señal en su dirección.
      grid({ es: 'Señales al grupo', en: 'Squad signals' }, 3, [b(''), b(EMOTE + 'emote_cs_forward'), b(''), b(EMOTE + 'emote_cs_left'), b(EMOTE + 'emote_cs_stop', { tone: 'amber' }),
        b(EMOTE + 'emote_cs_right'), b(EMOTE + 'emote_cs_yes', { tone: 'green' }), b(''), b(EMOTE + 'emote_cs_no', { tone: 'red' })]),
    ],
    row: [b('ui_notification.ui_notification_ignore'), b('default.toggle_contact')],
  },
];

const DOCK_LEFT: Btn[] = [b('ui_notification.ui_notification_accept', { tone: 'green' }), b('ui_notification.ui_notification_decline', { tone: 'red' }), b('spaceship_hud.mobiglas')];
const DOCK_RIGHT: Btn[] = [b('spaceship_hud.v_starmap'), b('default.toggle_chat')];

const EMERGENCY: Btn[] = [
  b('player.downedRevivalRequest', { danger: true }), b('seat_general.v_emergency_exit', { danger: true }), b('seat_general.v_eject', { danger: true }),
  b('spaceship_general.v_self_destruct', { danger: true }), b('player.force_respawn', { danger: true }),
];

/** Mapas internos del juego que no pintan nada en la lista completa. */
const HIDDEN_MAPS = new Set([
  'debug', 'flycam', 'spectator', 'view_director_mode', 'server_renderer', 'character_customizer',
  'RemoteRigidEntityController', 'player_input_optical_tracking', 'ui_textfield',
]);

const ARM_MS = 1500;

/** Quita la coletilla de modo de entrada: «Faros (alternar)» → «Faros». El resto del nombre oficial queda igual. */
export function cleanLabel(label: string): string {
  return label
    .replace(/\s*\((?:alternar|mantener|pulsar|toggle|hold|tap|press|short press|long press|pulsación corta|pulsación larga)\).*$/i, '')
    .trim();
}

// ---------------------------------------------------------------- estado compartido

interface Ctx {
  byId: Map<string, BoundAction>;
  notify: (kind: 'warn' | 'err' | 'ok', text: string) => void;
  openMissing: () => void;
}
const MandosCtx = createContext<Ctx>({ byId: new Map(), notify: () => {}, openMissing: () => {} });
const useMandos = () => useContext(MandosCtx);

type Avail = 'ok' | 'none' | 'mouse' | 'missing';

function availability(a: BoundAction | undefined): Avail {
  if (!a) return 'missing';
  if (!a.keys) return 'none';
  if (!a.sendable) return 'mouse';
  return 'ok';
}

async function send(id: string, phase: 'tap' | 'down' | 'up', confirm = false): Promise<SendResult> {
  try {
    const res = await fetch('/api/controls/send', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, phase, confirm }),
    });
    return (await res.json()) as SendResult;
  } catch {
    return { ok: false, reason: 'error', message: tr('Sin conexión con el PC. Comprueba que CommandGlass sigue abierto.', 'No connection to the PC. Make sure CommandGlass is still running.') };
  }
}

// ---------------------------------------------------------------- vista

const STORE = 'cg-mandos';
interface Saved { mode: ModeId; auto: boolean }

function loadSaved(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<Saved> | null;
    if (s && MODES.some((m) => m.id === s.mode)) return { mode: s.mode as ModeId, auto: s.auto !== false };
  } catch {
    /* sin almacenamiento */
  }
  return { mode: 'nave', auto: true };
}

export function Mandos({ onExit }: { onExit: () => void }) {
  const { snapshot, liveEvents } = useLive();
  const { lang, t } = useLang();
  const [data, setData] = useState<ControlsResponse | null>(null);
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [overlay, setOverlay] = useState<'none' | 'emergency' | 'search'>('none');
  const [searchMissing, setSearchMissing] = useState(false);
  const [toast, setToast] = useState<{ kind: 'warn' | 'err' | 'ok'; text: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const focus = useFocus();

  useEffect(() => {
    getJson<ControlsResponse>('/api/controls').then(setData).catch(() =>
      setData({ available: false, error: tr('No se ha podido cargar la lista de controles.', "Couldn't load the list of controls."), catalog: null }),
    );
  }, [lang]);

  const byId = useMemo(() => {
    const m = new Map<string, BoundAction>();
    for (const map of data?.catalog?.maps ?? []) for (const a of map.actions) m.set(a.id, a);
    return m;
  }, [data]);

  // Modo automático: en una nave, Nave; si no, A pie. Minería, chatarreo, combate y social se eligen a mano.
  const suggested: ModeId = snapshot?.state?.ship ? 'nave' : 'pie';
  const modeId = saved.auto ? suggested : saved.mode;
  const mode = MODES.find((m) => m.id === modeId) ?? MODES[0]!;
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(saved));
    } catch {
      /* sin almacenamiento */
    }
  }, [saved]);

  const downed = useMemo(() => {
    const recent = liveEvents.find((e) => ['health.downed', 'health.death', 'health.medbed'].includes(e.type));
    return recent?.type === 'health.downed' && Date.now() - Date.parse(recent.ts) < 10 * 60_000;
  }, [liveEvents]);

  const ctx: Ctx = useMemo(() => ({
    byId,
    notify: (kind, text) => {
      window.clearTimeout(toastTimer.current);
      setToast({ kind, text });
      toastTimer.current = window.setTimeout(() => setToast(null), kind === 'ok' ? 1600 : 3600);
    },
    openMissing: () => {
      setSearchMissing(true);
      setOverlay('search');
    },
  }), [byId]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const pick = (id: ModeId) => {
    setSaved({ mode: id, auto: id === suggested ? saved.auto : false });
    setOverlay('none');
  };

  return (
    <MandosCtx.Provider value={ctx}>
      <div className="mx" data-mode={mode.id}>
        <header className="mx-head">
          <button type="button" className="mx-back" onClick={onExit} aria-label={t('Volver a las secciones de CommandGlass', 'Back to the CommandGlass sections')}>
            <ChevronLeft size={18} aria-hidden />
            <img src={logo} alt="" width={40} height={34} />
            <span>CommandGlass</span>
          </button>
          <div className="mx-tabs" role="tablist" aria-label={t('Modo', 'Mode')}>
            {MODES.map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={m.id === mode.id} className={`mx-tab ${m.id === mode.id ? 'on' : ''}`} onClick={() => pick(m.id)}>
                <m.icon size={18} strokeWidth={1.6} aria-hidden />
                <span>{t(m.label)}</span>
                {saved.auto && m.id === suggested && <span className="mx-auto-dot" aria-label={t('elegido por el juego', 'picked from the game')} />}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`mx-auto ${saved.auto ? 'on' : ''}`}
            onClick={() => setSaved((s) => (s.auto ? { mode: modeId, auto: false } : { ...s, auto: true }))}
            aria-label={saved.auto ? t('Modo automático: cambia solo entre Nave y A pie', 'Auto mode: switches between Ship and On foot by itself') : t('Modo fijado a mano: pulsa para que siga al juego', 'Mode pinned by hand: tap to follow the game')}
          >
            <span className="mx-auto-dot" /> Auto
          </button>
          <button type="button" className="mx-icon-btn" onClick={() => { setSearchMissing(false); setOverlay('search'); }} aria-label={t('Buscar cualquier acción', 'Search any action')}>
            <Search size={20} strokeWidth={1.7} aria-hidden />
          </button>
          <Clock focus={focus} available={data?.available ?? true} />
        </header>

        {data?.error && <div className="mx-error" role="alert">{data.error}</div>}

        <div className="mx-top">
          {mode.top.map((btn, i) => <Pad key={`${mode.id}-top-${i}`} btn={btn} />)}
        </div>

        <div className="mx-body">
          <div className="mx-side left">{mode.left.map((s, i) => <SideBlock key={`${mode.id}-l${i}`} side={s} />)}</div>
          <div className="mx-hero">
            <Hero mode={mode} />
            {mode.row.length > 0 && (
              <div className="mx-row">{mode.row.map((btn, i) => <Pad key={`${mode.id}-row-${i}`} btn={btn} />)}</div>
            )}
          </div>
          <div className="mx-side right">{mode.right.map((s, i) => <SideBlock key={`${mode.id}-r${i}`} side={s} />)}</div>

          {overlay === 'emergency' && <EmergencySheet onClose={() => setOverlay('none')} />}
          {overlay === 'search' && <SearchSheet missingOnly={searchMissing} setMissingOnly={setSearchMissing} onClose={() => setOverlay('none')} />}
          {toast && <div className={`mx-toast ${toast.kind}`} role="status"><span className="mx-toast-dot" />{toast.text}</div>}
        </div>

        <footer className="mx-dock" aria-label={t('Siempre a mano', 'Always at hand')}>
          {DOCK_LEFT.map((btn, i) => <Pad key={`dl${i}`} btn={btn} className="dock" />)}
          <div className="mx-dock-emblem" aria-hidden><img src={logo} alt="" width={62} height={53} /></div>
          {DOCK_RIGHT.map((btn, i) => <Pad key={`dr${i}`} btn={btn} className="dock" />)}
          <button type="button" className={`mx-cover ${downed ? 'alert' : ''}`} onClick={() => setOverlay('emergency')} aria-label={t('Emergencia: levantar la tapa', 'Emergency: lift the cover')}>
            <Lock size={18} strokeWidth={1.7} aria-hidden />
            <span>{t('Emergencia', 'Emergency')}</span>
          </button>
        </footer>
      </div>
    </MandosCtx.Provider>
  );
}

// ---------------------------------------------------------------- botón

/**
 * Botón de acción. Pulsar = toque (el servidor ya mantiene la tecla el tiempo que pida el juego).
 * Acciones de modo «mantener» del juego: se envían mientras el dedo está encima.
 * Acciones delicadas: mantener 1,5 s para confirmar; si se suelta antes, no se envía nada.
 */
function Pad({ btn, className = '', children, style, label: labelOverride }: { btn: Btn; className?: string; children?: ReactNode; style?: CSSProperties; label?: string }) {
  const { byId, notify } = useMandos();
  const { t } = useLang();
  const [phase, setPhase] = useState<'idle' | 'busy' | 'ok' | 'err' | 'holding' | 'arming'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!btn.id) return <span className="mx-gap" aria-hidden />;

  const action = byId.get(btn.id);
  const avail = availability(action);
  const continuous = avail === 'ok' && !btn.danger && action?.mode === 'hold';
  const label = labelOverride ?? (action ? cleanLabel(action.label) : btn.id.split('.').pop() ?? btn.id);

  const settle = (r: SendResult) => {
    if (r.ok) {
      setPhase('ok');
      timer.current = window.setTimeout(() => setPhase('idle'), 500);
    } else {
      setPhase('err');
      notify('err', r.message);
      timer.current = window.setTimeout(() => setPhase('idle'), 1500);
    }
  };

  const explain = () => {
    if (avail === 'none') notify('warn', t(`${label}: sin tecla en tu perfil. Asígnale una en Opciones › Controles del juego y funcionará desde aquí.`, `${label}: no key in your profile. Bind one in the game under Options › Keybindings and it will work from here.`));
    else if (avail === 'mouse') notify('warn', t(`${label} va con el ratón en tu perfil. Asígnale una tecla de teclado para usarlo desde aquí.`, `${label} is on the mouse in your profile. Bind a keyboard key to use it from here.`));
    else notify('warn', t('Esta acción no existe en esta versión del juego.', "This action doesn't exist in this version of the game."));
  };

  const onClick = async () => {
    if (avail !== 'ok') return explain();
    if (continuous || btn.danger || phase === 'busy') return;
    window.clearTimeout(timer.current);
    setPhase('busy');
    settle(await send(btn.id, 'tap'));
  };

  const onDown = () => {
    if (avail !== 'ok') return;
    window.clearTimeout(timer.current);
    if (btn.danger) {
      setPhase('arming');
      timer.current = window.setTimeout(async () => {
        setPhase('busy');
        settle(await send(btn.id, 'tap', true));
      }, ARM_MS);
    } else if (continuous) {
      setPhase('holding');
      void send(btn.id, 'down').then((r) => !r.ok && settle(r));
    }
  };

  const onUp = () => {
    if (phase === 'arming') {
      window.clearTimeout(timer.current);
      setPhase('idle');
      notify('warn', t('Has soltado antes de tiempo: no se ha enviado nada.', 'Released too early: nothing was sent.'));
    } else if (phase === 'holding') {
      setPhase('idle');
      void send(btn.id, 'up');
    }
  };

  let badge: string | null = null;
  if (avail === 'none') badge = t('Sin tecla', 'Unbound');
  else if (avail === 'mouse') badge = t('Solo ratón', 'Mouse only');
  else if (avail === 'missing') badge = t('No disponible', 'Unavailable');
  else if (btn.danger) badge = t('Mantén 1,5 s', 'Hold 1.5 s');
  else if (continuous) badge = t('Mientras pulses', 'While held');

  const classes = ['mpad', className, btn.tone ? `toned t-${btn.tone}` : '', btn.danger ? 'toned t-red danger' : '', btn.big ? 'big' : '', btn.wide ? 'wide' : '',
    avail !== 'ok' ? 'off' : '', phase].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      style={{ ...style, ...(action ? { ['--hold' as string]: `${Math.max(action.plan.holdMs, 300)}ms` } : {}) }}
      onClick={onClick}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      title={action?.description ?? undefined}
      aria-label={badge ? `${label}, ${badge}` : label}
    >
      <span className="mpad-fill" aria-hidden />
      {children ?? <span className="mpad-label">{label}</span>}
      {badge && <span className="mpad-badge">{badge}</span>}
    </button>
  );
}

// ---------------------------------------------------------------- laterales

function SideBlock({ side }: { side: Side }) {
  const { t } = useLang();
  const { byId, openMissing } = useMandos();
  if (side.kind === 'tracks') {
    return (
      <section className="mx-group" aria-label={t(side.title)}>
        <span className="mx-group-title">{t(side.title)}</span>
        <div className="mx-tracks">
          {side.tracks.map((tr0) => (
            <div key={tr0.plus} className="mx-track">
              <Pad btn={b(tr0.plus)} label="+" className="sign" />
              <span className="mx-track-label"><i aria-hidden />{t(tr0.label)}<i aria-hidden /></span>
              <Pad btn={b(tr0.minus)} label="−" className="sign" />
            </div>
          ))}
        </div>
        <Pad btn={b(side.reset)} className="mx-reset" />
      </section>
    );
  }
  const missing = side.buttons.filter((x) => x.id && availability(byId.get(x.id)) !== 'ok').length;
  return (
    <section className="mx-group" aria-label={t(side.title)}>
      <span className="mx-group-title">{t(side.title)}</span>
      {byId.size > 0 && missing > 0 && (
        <button type="button" className="mx-banner" onClick={openMissing}>
          {missing === 1
            ? t('1 acción sin tecla en tu perfil · ver cómo asignarla', '1 action without a key in your profile · see how to bind it')
            : t(`${missing} acciones sin tecla en tu perfil · ver cómo asignarlas`, `${missing} actions without a key in your profile · see how to bind them`)}
        </button>
      )}
      <div className="mx-grid" style={{ gridTemplateColumns: `repeat(${side.cols}, minmax(0, 1fr))` }}>
        {side.buttons.map((btn, i) => <Pad key={i} btn={btn} />)}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- controles centrales

function Hero({ mode }: { mode: Mode }) {
  switch (mode.hero) {
    case 'quantum': return <QuantumHero />;
    case 'target': return <TargetHero />;
    case 'wheel': return <WheelHero />;
    case 'laser': return <LaserHero />;
    case 'salvage': return <SalvageHero />;
    case 'invite': return <InviteHero />;
  }
}

function MissingNote({ ids }: { ids: string[] }) {
  const { byId, openMissing } = useMandos();
  const { t } = useLang();
  const off = ids.filter((id) => availability(byId.get(id)) !== 'ok');
  if (!byId.size || !off.length) return null;
  const names = off.map((id) => cleanLabel(byId.get(id)?.label ?? id)).join(' · ');
  return (
    <button type="button" className="mx-banner" onClick={openMissing}>
      {t(`Sin tecla de teclado en tu perfil: ${names}. Asígnasela en Opciones › Controles y funcionará desde aquí.`, `No keyboard key in your profile: ${names}. Bind one under Options › Keybindings and it will work from here.`)}
    </button>
  );
}

function QuantumHero() {
  const { t } = useLang();
  const id = 'spaceship_quantum.v_toggle_qdrive_engagement';
  return (
    <>
      <div className="mx-stage">
        <Pad btn={b(id)} className="quantum">
          <svg className="q-ring" viewBox="0 0 300 300" aria-hidden>
            <circle cx="150" cy="150" r="146" className="q-outer" />
            <circle cx="150" cy="150" r="138" className="q-ticks" />
            <circle cx="150" cy="150" r="126" className="q-track" />
            <circle cx="150" cy="150" r="126" className="q-progress" transform="rotate(-90 150 150)" />
          </svg>
          <span className="q-core">
            <span className="q-title">{t('Salto cuántico', 'Quantum jump')}</span>
            <span className="q-hint">{t('Pulsa para iniciar', 'Tap to engage')}</span>
          </span>
        </Pad>
      </div>
      <MissingNote ids={[id]} />
    </>
  );
}

/** Panal de objetivos: fijación automática en el centro; arriba fijar marcados 1–3, abajo marcar 1–3. */
function TargetHero() {
  const { t } = useLang();
  const dist = 138;
  const ring: [number, string, string][] = [
    [210, TARGET + 'v_target_toggle_lock_index_1', '1'], [270, TARGET + 'v_target_toggle_lock_index_2', '2'], [330, TARGET + 'v_target_toggle_lock_index_3', '3'],
    [150, TARGET + 'v_target_toggle_pin_index_1', '1'], [90, TARGET + 'v_target_toggle_pin_index_2', '2'], [30, TARGET + 'v_target_toggle_pin_index_3', '3'],
  ];
  const hex = <svg className="hex-shape" viewBox="0 0 100 87" preserveAspectRatio="none" aria-hidden><polygon points="25,1 75,1 99,43.5 75,86 25,86 1,43.5" /></svg>;
  return (
    <div className="mx-stage">
      <div className="target-stage">
        <span className="target-caption top">{t('Fijar marcado', 'Lock pinned')}</span>
        <Pad btn={b(TARGET + 'v_auto_targeting_toggle_long', { tone: 'red' })} className="hex big-hex" style={{ left: 'calc(50% - 88px)', top: 'calc(50% - 76px)' }}>
          {hex}
          <span className="mpad-label">{t('Fijación automática', 'Auto targeting')}</span>
        </Pad>
        {ring.map(([deg, id, n]) => {
          const a = (deg * Math.PI) / 180;
          const x = Math.round(Math.cos(a) * dist - 58);
          const y = Math.round(Math.sin(a) * dist - 50);
          return (
            <Pad key={id} btn={b(id)} className="hex" style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}>
              {hex}
              <span className="hex-num">{n}</span>
            </Pad>
          );
        })}
        <span className="target-caption bottom">{t('Marcar objetivo', 'Pin target')}</span>
      </div>
    </div>
  );
}

/** Rueda de armas: las seis selecciones alrededor y «enfundar» en el centro. */
function WheelHero() {
  const ids = ['player.select_primary_pit', 'player.select_secondary_pit', 'player.select_sidearm_pit', 'player.select_gadget_pit', 'player.selectUnarmedCombat', 'player.select_meleeweapon_pit'];
  return (
    <div className="mx-stage">
      <div className="wheel-stage">
        <svg className="wheel-ring" viewBox="0 0 400 400" aria-hidden>
          <circle cx="200" cy="200" r="150" />
          <circle cx="200" cy="200" r="84" />
        </svg>
        {ids.map((id, i) => {
          const a = ((-90 + i * 60) * Math.PI) / 180;
          return <Pad key={id} btn={b(id, i === 0 ? { tone: 'accent' } : undefined)} className="spoke" style={{ left: `calc(50% + ${Math.round(Math.cos(a) * 150 - 70)}px)`, top: `calc(50% + ${Math.round(Math.sin(a) * 150 - 32)}px)` }} />;
        })}
        <Pad btn={b('player.holster')} className="wheel-center" />
      </div>
    </div>
  );
}

function LaserHero() {
  const ids = [MINING + 'v_toggle_mining_laser_fire', MINING + 'v_toggle_mining_laser_type', MINING + 'v_increase_mining_throttle', MINING + 'v_decrease_mining_throttle'];
  const { t } = useLang();
  return (
    <>
      <MissingNote ids={ids} />
      <div className="laser-stage">
        <div className="laser-main">
          <Pad btn={b(ids[0]!)} className="laser">
            <Target size={56} strokeWidth={1.2} aria-hidden />
            <span className="mpad-label">{t('Láser', 'Laser')}</span>
          </Pad>
          <Pad btn={b(ids[1]!)} />
        </div>
        <div className="mx-track">
          <Pad btn={b(ids[2]!)} label="+" className="sign" />
          <span className="mx-track-label"><i aria-hidden />{t('Potencia', 'Power')}<i aria-hidden /></span>
          <Pad btn={b(ids[3]!)} label="−" className="sign" />
        </div>
      </div>
    </>
  );
}

function SalvageHero() {
  return (
    <div className="salvage-stage">
      <Pad btn={b(SALV + 'v_salvage_toggle_fire_left', { tone: 'accent', big: true })} className="s-left" />
      <Pad btn={b(SALV + 'v_salvage_toggle_fire_fracture', { big: true })} className="s-frac" />
      <Pad btn={b(SALV + 'v_salvage_toggle_fire_disintegrate', { big: true })} className="s-dis" />
      <Pad btn={b(SALV + 'v_salvage_toggle_fire_right', { tone: 'accent', big: true })} className="s-right" />
    </div>
  );
}

function InviteHero() {
  return (
    <div className="invite-stage">
      <Pad btn={b('ui_notification.ui_notification_accept', { tone: 'green' })} className="invite">
        <Check size={56} strokeWidth={1.5} aria-hidden />
        <InviteLabel id="ui_notification.ui_notification_accept" />
      </Pad>
      <Pad btn={b('ui_notification.ui_notification_decline', { tone: 'red' })} className="invite">
        <X size={56} strokeWidth={1.5} aria-hidden />
        <InviteLabel id="ui_notification.ui_notification_decline" />
      </Pad>
    </div>
  );
}

function InviteLabel({ id }: { id: string }) {
  const { byId } = useMandos();
  const a = byId.get(id);
  return <span className="mpad-label">{a ? cleanLabel(a.label) : ''}</span>;
}

// ---------------------------------------------------------------- emergencia y búsqueda

function EmergencySheet({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  return (
    <div className="mx-overlay">
      <section className="mx-sheet danger" aria-label={t('Emergencia', 'Emergency')}>
        <div className="mx-sheet-head">
          <Lock size={24} strokeWidth={1.6} aria-hidden />
          <div>
            <h2>{t('Emergencia', 'Emergency')}</h2>
            <p>{t('Tapa levantada. Mantén pulsado 1,5 s para confirmar; si sueltas antes, no se envía nada.', 'Cover lifted. Hold for 1.5 s to confirm; release early and nothing is sent.')}</p>
          </div>
          <button type="button" className="mx-close" onClick={onClose}>{t('Cerrar la tapa', 'Close the cover')}</button>
        </div>
        <div className="mx-sheet-grid">
          {EMERGENCY.map((btn) => <Pad key={btn.id} btn={{ ...btn, big: true }} />)}
        </div>
      </section>
    </div>
  );
}

/** Todas las acciones de los mandos de Mandos, más el resto del catálogo, con búsqueda y la lista de teclas que faltan. */
function SearchSheet({ missingOnly, setMissingOnly, onClose }: { missingOnly: boolean; setMissingOnly: (v: boolean) => void; onClose: () => void }) {
  const { t } = useLang();
  const { byId } = useMandos();
  const [query, setQuery] = useState('');
  const [showKeys, setShowKeys] = useState(false);

  const used = useMemo(() => {
    const ids = new Set<string>();
    const addBtn = (x: Btn) => x.id && ids.add(x.id);
    for (const m of MODES) {
      [...m.top, ...m.row].forEach(addBtn);
      for (const s of [...m.left, ...m.right]) {
        if (s.kind === 'grid') s.buttons.forEach(addBtn);
        else {
          s.tracks.forEach((x) => { ids.add(x.plus); ids.add(x.minus); });
          ids.add(s.reset);
        }
      }
    }
    [...DOCK_LEFT, ...DOCK_RIGHT, ...EMERGENCY].forEach(addBtn);
    [
      'spaceship_quantum.v_toggle_qdrive_engagement', MINING + 'v_toggle_mining_laser_fire', MINING + 'v_toggle_mining_laser_type',
      MINING + 'v_increase_mining_throttle', MINING + 'v_decrease_mining_throttle', SALV + 'v_salvage_toggle_fire_left', SALV + 'v_salvage_toggle_fire_right',
      SALV + 'v_salvage_toggle_fire_fracture', SALV + 'v_salvage_toggle_fire_disintegrate', TARGET + 'v_auto_targeting_toggle_long', 'player.holster',
      'ui_notification.ui_notification_accept', 'ui_notification.ui_notification_decline',
    ].forEach((id) => ids.add(id));
    for (const n of [1, 2, 3]) { ids.add(`${TARGET}v_target_toggle_lock_index_${n}`); ids.add(`${TARGET}v_target_toggle_pin_index_${n}`); }
    ['player.select_primary_pit', 'player.select_secondary_pit', 'player.select_sidearm_pit', 'player.select_gadget_pit', 'player.selectUnarmedCombat', 'player.select_meleeweapon_pit'].forEach((id) => ids.add(id));
    return ids;
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...byId.values()].filter((a) => !HIDDEN_MAPS.has(a.map) && a.label !== a.name);
    const list = missingOnly ? all.filter((a) => used.has(a.id) && availability(a) !== 'ok') : all;
    return list
      .filter((a) => !q || a.label.toLowerCase().includes(q) || (showKeys && a.keyLabels.join(' ').toLowerCase().includes(q)))
      .sort((x, y) => Number(used.has(y.id)) - Number(used.has(x.id)) || x.label.localeCompare(y.label))
      .slice(0, 120);
  }, [byId, used, query, missingOnly, showKeys]);

  return (
    <div className="mx-overlay">
      <section className="mx-sheet" aria-label={t('Buscar acción', 'Search action')}>
        <div className="mx-search-bar">
          <label className="search-wrap">
            <Search size={16} aria-hidden />
            <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Buscar acción: aterrizaje, casco, señuelos…', 'Search action: landing, helmet, decoys…')} aria-label={t('Buscar acción', 'Search action')} />
          </label>
          <button type="button" className={`chip ${!missingOnly ? 'on' : ''}`} onClick={() => setMissingOnly(false)}>{t('Todas', 'All')}</button>
          <button type="button" className={`chip ${missingOnly ? 'on' : ''}`} onClick={() => setMissingOnly(true)}>{t('Sin tecla en Mandos', 'Unbound in Controls')}</button>
          <button type="button" className={`chip ${showKeys ? 'on' : ''}`} onClick={() => setShowKeys((v) => !v)} aria-pressed={showKeys}>
            <Keyboard size={16} aria-hidden /> {t('Ver teclas', 'Show keys')}
          </button>
          <button type="button" className="mx-close" onClick={onClose}>{t('Cerrar', 'Close')}</button>
        </div>
        <p className="mx-sheet-hint">
          {missingOnly
            ? t('Funciones de Mandos que hoy no se pueden usar desde la tablet porque en tu perfil del juego no tienen tecla de teclado. Asígnales una en Opciones › Controles y CommandGlass las activará sola.',
              "Controls functions you can't use from the tablet yet because they have no keyboard key in your game profile. Bind one under Options › Keybindings and CommandGlass picks it up by itself.")
            : t('Todas las acciones de tus controles. Lo que uses a menudo está mejor en su modo.', 'Every action in your controls. Whatever you use often is better in its mode.')}
        </p>
        <div className="mx-results">
          {rows.length === 0 && <div className="empty">{missingOnly ? t('No falta ninguna tecla: todo Mandos funciona con tu perfil.', 'No keys missing: all of Controls works with your profile.') : t('Nada coincide con la búsqueda.', 'Nothing matches your search.')}</div>}
          {rows.map((a) => (
            <Pad key={a.id} btn={b(a.id)} className="result">
              <span className="mpad-label">{cleanLabel(a.label)}</span>
              {showKeys && a.keyLabels.length > 0 && <span className="pad-keys">{a.keyLabels.map((k) => <kbd key={k}>{k}</kbd>)}</span>}
            </Pad>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- foco del juego

interface Focus {
  focused: boolean | null;
  foreground: string | null;
}

/** Pregunta cada pocos segundos si Star Citizen está en primer plano en el PC. */
function useFocus(): Focus {
  const [focus, setFocus] = useState<Focus>({ focused: null, foreground: null });
  useEffect(() => {
    let alive = true;
    const tick = () =>
      getJson<Focus>('/api/controls/focus')
        .then((f) => alive && setFocus(f))
        .catch(() => alive && setFocus({ focused: null, foreground: null }));
    tick();
    const timer = window.setInterval(tick, 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  return focus;
}

function Clock({ focus, available }: { focus: Focus; available: boolean }) {
  const { t } = useLang();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const state = !available ? 'off' : focus.focused === null ? 'wait' : focus.focused ? 'live' : 'warn';
  const text = {
    off: t('Envío no disponible', 'Sending unavailable'),
    wait: t('Comprobando…', 'Checking…'),
    live: t('Juego listo', 'Game ready'),
    warn: t('Juego sin foco', 'Game not focused'),
  }[state];
  return (
    <span className={`mx-clock ${state}`} title={state === 'warn' ? t('Las teclas solo llegan con la ventana de Star Citizen en primer plano en el PC.', 'Keys only reach the game while the Star Citizen window is in the foreground on the PC.') : undefined}>
      <strong><span className="mx-focus-dot" aria-hidden />{hhmm(now)}</strong>
      <small>{text}</small>
    </span>
  );
}
