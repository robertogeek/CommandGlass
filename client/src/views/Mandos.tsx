import {
  AlertTriangle, Crosshair, Gamepad2, HeartPulse, Keyboard, MessageSquare, Pickaxe, Rocket, Search, Siren, User, Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../lang.tsx';
import { getJson, useLive } from '../live.tsx';
import type { BindingMap, BoundAction, ControlsResponse, SendResult } from '../types.ts';

/**
 * Botonera: botones grandes que pulsan en el PC la tecla de cada acción del juego.
 * Las teclas salen de tus controles reales (por defecto del juego + tus cambios); aquí solo se eligen
 * las acciones útiles y se les da un nombre corto.
 */

type Context = 'ship' | 'foot' | 'any';

interface PadButton {
  /** Acción del juego ("mapa.acción"): el botón muestra su nombre oficial en el idioma elegido. */
  id: string;
  danger?: boolean;
}

interface Panel {
  id: string;
  title: string;
  icon: LucideIcon;
  context: Context;
  buttons: PadButton[];
}

const PANELS: Panel[] = [
  {
    id: 'vuelo', title: 'Vuelo', icon: Rocket, context: 'ship',
    buttons: [
      { id: 'spaceship_general.v_flightready' },
      { id: 'spaceship_power.v_power_toggle' },
      { id: 'spaceship_movement.v_toggle_landing_system' },
      { id: 'spaceship_movement.v_atc_request' },
      { id: 'spaceship_movement.v_autoland' },
      { id: 'spaceship_movement.v_atc_loading_area_request' },
      { id: 'spaceship_docking.v_toggle_docking_request' },
      { id: 'spaceship_movement.v_master_mode_cycle_long' },
      { id: 'spaceship_movement.v_vtol_toggle' },
      { id: 'spaceship_movement.v_ifcs_vector_decoupling_toggle' },
      { id: 'lights_controller.v_lights' },
      { id: 'seat_general.v_light_amplification_toggle' },
    ],
  },
  {
    id: 'energia', title: 'Energía y escudos', icon: Zap, context: 'ship',
    buttons: [
      { id: 'spaceship_power.v_power_toggle_thrusters' },
      { id: 'spaceship_power.v_power_toggle_shields' },
      { id: 'spaceship_power.v_power_toggle_weapons' },
      { id: 'spaceship_power.v_engineering_assignment_weapons_increase' },
      { id: 'spaceship_power.v_engineering_assignment_engine_increase' },
      { id: 'spaceship_power.v_engineering_assignment_shields_increase' },
      { id: 'spaceship_power.v_engineering_assignment_weapons_decrease' },
      { id: 'spaceship_power.v_engineering_assignment_engine_decrease' },
      { id: 'spaceship_power.v_engineering_assignment_shields_decrease' },
      { id: 'spaceship_power.v_engineering_assignment_reset' },
    ],
  },
  {
    id: 'combate', title: 'Combate', icon: Crosshair, context: 'ship',
    buttons: [
      { id: 'spaceship_defensive.v_weapon_countermeasure_decoy_launch' },
      { id: 'spaceship_defensive.v_weapon_countermeasure_noise_launch' },
      { id: 'spaceship_weapons.v_weapon_gimbals_state_toggle' },
      { id: 'spaceship_weapons.v_weapon_aim_type_cycle' },
      { id: 'spaceship_targeting.v_auto_targeting_toggle_long' },
      { id: 'spaceship_targeting.v_target_unlock' },
      { id: 'spaceship_targeting.v_target_remove_all_pins' },
      { id: 'seat_general.v_toggle_scan_mode' },
    ],
  },
  {
    id: 'industria', title: 'Minería y recuperación', icon: Pickaxe, context: 'ship',
    buttons: [
      { id: 'seat_general.v_cycle_industrial_mode' },
      { id: 'spaceship_mining.v_mining_use_consumable1' },
      { id: 'spaceship_mining.v_mining_use_consumable2' },
      { id: 'spaceship_mining.v_mining_use_consumable3' },
      { id: 'spaceship_mining.v_jettison_volatile_cargo' },
      { id: 'spaceship_salvage.v_salvage_toggle_gimbal_mode' },
      { id: 'spaceship_salvage.v_salvage_reset_gimbal' },
    ],
  },
  {
    id: 'pie', title: 'A pie', icon: User, context: 'foot',
    buttons: [
      { id: 'player.toggle_flashlight' },
      { id: 'player.toggleAttachHelmet' },
      { id: 'player.visor_wipe' },
      { id: 'player.holster' },
      { id: 'player.weapon_change_firemode' },
      { id: 'player.toggle_lowered' },
      { id: 'player.select_primary_pit' },
      { id: 'player.select_secondary_pit' },
      { id: 'player.select_sidearm_pit' },
      { id: 'player.select_gadget_pit' },
      { id: 'player.selectUnarmedCombat' },
      { id: 'player.thirdperson' },
    ],
  },
  {
    id: 'mobiglas', title: 'mobiGlas y comunicación', icon: MessageSquare, context: 'any',
    buttons: [
      { id: 'spaceship_hud.mobiglas' },
      { id: 'spaceship_hud.v_starmap' },
      { id: 'default.toggle_contact' },
      { id: 'default.toggle_chat' },
      { id: 'default.notification_accept' },
      { id: 'default.notification_decline' },
    ],
  },
  {
    id: 'emergencia', title: 'Emergencia', icon: Siren, context: 'any',
    buttons: [
      { id: 'player.downedRevivalRequest' },
      { id: 'seat_general.v_emergency_exit', danger: true },
      { id: 'seat_general.v_eject', danger: true },
      { id: 'spaceship_general.v_self_destruct', danger: true },
      { id: 'player.force_respawn', danger: true },
    ],
  },
];

/** Mapas internos del juego que no pintan nada en la chuleta. */
const HIDDEN_MAPS = new Set([
  'debug', 'flycam', 'spectator', 'view_director_mode', 'server_renderer', 'character_customizer',
  'RemoteRigidEntityController', 'player_input_optical_tracking', 'ui_textfield',
]);

type Tab = 'pad' | 'sheet';

export function Mandos() {
  const { snapshot, liveEvents } = useLive();
  const [data, setData] = useState<ControlsResponse | null>(null);
  const [tab, setTab] = useState<Tab>('pad');
  const focus = useFocus();

  const { lang } = useLang();
  useEffect(() => {
    getJson<ControlsResponse>('/api/controls').then(setData).catch(() =>
      setData({ available: false, error: 'No se ha podido cargar la lista de controles.', catalog: null }),
    );
  }, [lang]);

  const byId = useMemo(() => {
    const m = new Map<string, BoundAction>();
    for (const map of data?.catalog?.maps ?? []) for (const a of map.actions) m.set(a.id, a);
    return m;
  }, [data]);

  const inShip = Boolean(snapshot?.state?.ship);
  const context: Context = inShip ? 'ship' : 'foot';
  // Incapacitado hace poco y sin cama médica ni muerte después: el botón de rescate pasa arriba.
  const downed = useMemo(() => {
    const recent = liveEvents.find((e) => ['health.downed', 'health.death', 'health.medbed'].includes(e.type));
    return recent?.type === 'health.downed' && Date.now() - Date.parse(recent.ts) < 10 * 60_000;
  }, [liveEvents]);

  const panels = useMemo(() => {
    const rank = (p: Panel) => (p.context === context ? 0 : p.context === 'any' ? 1 : 2);
    return [...PANELS].sort((a, b) => rank(a) - rank(b));
  }, [context]);

  return (
    <div className="mandos">
      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Vista">
          <button role="tab" aria-selected={tab === 'pad'} className={`seg ${tab === 'pad' ? 'on' : ''}`} onClick={() => setTab('pad')}>
            <Gamepad2 size={16} aria-hidden /> Botonera
          </button>
          <button role="tab" aria-selected={tab === 'sheet'} className={`seg ${tab === 'sheet' ? 'on' : ''}`} onClick={() => setTab('sheet')}>
            <Keyboard size={16} aria-hidden /> Chuleta de controles
          </button>
        </div>
        <FocusPill focus={focus} available={data?.available ?? true} />
        <span className="pill">{inShip ? `En nave${snapshot?.state?.ship ? ` · ${snapshot.state.ship.name}` : ''}` : 'A pie'}</span>
      </div>

      {data?.error && <div className="panel warn"><div className="sub">{data.error}</div></div>}

      {tab === 'pad' && data?.catalog && (
        <div className="stack">
          {downed && (
            <div className="panel warn">
              <div className="label"><HeartPulse size={14} aria-hidden /> Estás incapacitado</div>
              <div className="pad-grid">
                <PadKey button={{ id: 'player.downedRevivalRequest' }} action={byId.get('player.downedRevivalRequest')} />
              </div>
            </div>
          )}
          {panels.map((p) => (
            <section key={p.id} className={`panel ${p.id === 'emergencia' ? 'danger-zone' : ''}`} aria-label={p.title}>
              <div className="label"><p.icon size={14} aria-hidden /> {p.title}</div>
              <div className="pad-grid">
                {p.buttons.map((b) => <PadKey key={b.id} button={b} action={byId.get(b.id)} />)}
              </div>
            </section>
          ))}
          <p className="faint pad-note">
            Las teclas son las de tus controles del juego. Para que lleguen, la ventana de Star Citizen tiene que estar en primer plano en el PC.
          </p>
        </div>
      )}

      {tab === 'sheet' && data?.catalog && <CheatSheet maps={data.catalog.maps} />}
    </div>
  );
}

// ---------------------------------------------------------------- botón

async function sendAction(id: string, confirm: boolean): Promise<SendResult> {
  try {
    const res = await fetch('/api/controls/send', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, phase: 'tap', confirm }),
    });
    return (await res.json()) as SendResult;
  } catch {
    return { ok: false, reason: 'error', message: 'Sin conexión con el PC. Comprueba que CommandGlass sigue abierto.' };
  }
}

function PadKey({ button, action }: { button: PadButton; action: BoundAction | undefined }) {
  const [state, setState] = useState<'idle' | 'armed' | 'sending' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const reset = (ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setState('idle');
      setMessage(null);
    }, ms);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const disabled = !action || !action.sendable;
  const reason = !action
    ? 'Esta acción no existe en esta versión del juego.'
    : !action.keys
      ? 'Sin tecla: asígnale una en Opciones → Controles del juego.'
      : !action.sendable
        ? 'Usa el ratón: la botonera solo envía teclado.'
        : null;

  const onPress = async () => {
    if (disabled || state === 'sending') return;
    if (button.danger && state !== 'armed') {
      setState('armed');
      setMessage('Toca otra vez para confirmar');
      reset(3000);
      return;
    }
    setState('sending');
    const r = await sendAction(button.id, Boolean(button.danger));
    if (r.ok) {
      setState('ok');
      setMessage(null);
      reset(900);
    } else {
      setState('error');
      setMessage(r.message);
      reset(4000);
    }
  };

  return (
    <button
      className={`pad ${button.danger ? 'danger' : ''} ${state}`}
      onClick={onPress}
      disabled={disabled}
      title={action ? `${action.label}${action.description ? ` — ${action.description}` : ''}` : undefined}
    >
      <span className="pad-label">{state === 'armed' ? '¿Seguro?' : action?.label ?? button.id.split('.').pop()}</span>
      <span className="pad-keys">
        {action?.keyLabels.length ? action.keyLabels.map((k) => <kbd key={k}>{k}</kbd>) : <span className="faint">sin tecla</span>}
        {action && action.plan.holdMs > 300 && <span className="faint hold-hint">mantiene {(action.plan.holdMs / 1000).toFixed(1).replace('.', ',')} s</span>}
      </span>
      {(message || (disabled && reason)) && (
        <span className={`pad-msg ${state === 'error' ? 'err' : ''}`} role={state === 'error' ? 'alert' : undefined}>
          {message ?? reason}
        </span>
      )}
    </button>
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
    const t = window.setInterval(tick, 3000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return focus;
}

function FocusPill({ focus, available }: { focus: Focus; available: boolean }) {
  if (!available) return <span className="pill"><span className="dot off" /> Envío de teclas no disponible</span>;
  if (focus.focused === null) return <span className="pill"><span className="dot" /> Comprobando el juego…</span>;
  return focus.focused ? (
    <span className="pill"><span className="dot live" /> Juego en primer plano</span>
  ) : (
    <span className="pill amber-pill"><AlertTriangle size={14} aria-hidden /> El juego no está en primer plano</span>
  );
}

// ---------------------------------------------------------------- chuleta

function CheatSheet({ maps }: { maps: BindingMap[] }) {
  const [query, setQuery] = useState('');
  const [onlyBound, setOnlyBound] = useState(true);
  const [onlyMine, setOnlyMine] = useState(false);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return maps
      .filter((m) => !HIDDEN_MAPS.has(m.name))
      .map((m) => ({
        ...m,
        actions: m.actions.filter(
          (a) =>
            a.label !== a.name &&
            (!onlyBound || a.keys) &&
            (!onlyMine || a.custom) &&
            (!q || a.label.toLowerCase().includes(q) || a.keyLabels.join(' ').toLowerCase().includes(q) || m.label.toLowerCase().includes(q)),
        ),
      }))
      .filter((m) => m.actions.length);
  }, [maps, query, onlyBound, onlyMine]);

  const total = groups.reduce((n, g) => n + g.actions.length, 0);

  return (
    <div className="stack">
      <div className="toolbar">
        <label className="search-wrap">
          <Search size={16} aria-hidden />
          <input
            className="search"
            type="search"
            placeholder="Buscar acción o tecla: aterrizaje, Alt, F1…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar en la chuleta"
          />
        </label>
        <button className={`chip ${onlyBound ? 'on' : ''}`} onClick={() => setOnlyBound((v) => !v)}>Solo con tecla</button>
        <button className={`chip ${onlyMine ? 'on' : ''}`} onClick={() => setOnlyMine((v) => !v)}>Cambiadas por ti</button>
        <span className="faint">{total} acciones</span>
      </div>
      {groups.length === 0 && <div className="panel"><div className="empty">Nada coincide con la búsqueda. Prueba con otra palabra o quita los filtros.</div></div>}
      {groups.map((g) => (
        <section key={g.name} className="panel" aria-label={g.label}>
          <div className="label">{g.label}</div>
          {g.actions.map((a) => (
            <div key={a.id} className="kv sheet-row">
              <span>
                {a.label}
                {a.custom && <span className="badge violet sheet-badge">{a.keys ? 'Tuya' : 'Quitada por ti'}</span>}
              </span>
              <span className="pad-keys">
                {a.keyLabels.length ? a.keyLabels.map((k) => <kbd key={k}>{k}</kbd>) : <span className="faint">—</span>}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
