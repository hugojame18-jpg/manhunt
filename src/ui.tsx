// Composants d'interface partagés (style iOS).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ChevronRight,
  Crosshair,
  Flame,
  Footprints,
  Hand,
  Hourglass,
  LoaderCircle,
  Map as IconeCarte,
  Moon,
  Radar,
  Star,
  TriangleAlert,
  VenetianMask,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from './jeu'

/** Couleurs des rôles (variables CSS, suivent le mode sombre). */
export const COULEUR_ROLE: Record<Role, string> = { runner: 'var(--vert)', chasseur: 'var(--orange)' }
export const ICONE_ROLE: Record<Role, LucideIcon> = { runner: Footprints, chasseur: Crosshair }
export const NOM_ROLE: Record<Role, string> = { runner: 'Runner', chasseur: 'Chasseur' }

export function initiale(nom: string): string {
  return (Array.from(nom.trim())[0] ?? '?').toUpperCase()
}

export function Avatar({ nom, couleur, taille = 40 }: { nom: string; couleur: string; taille?: number }) {
  return (
    <span className="avatar" style={{ background: couleur, width: taille, height: taille, fontSize: taille * 0.42 }}>
      {initiale(nom)}
    </span>
  )
}

export function PastilleRole({ role }: { role: Role }) {
  const Icone = ICONE_ROLE[role]
  return (
    <span className="pastille-role" style={{ ['--c' as string]: COULEUR_ROLE[role] }}>
      <Icone size={15} strokeWidth={2.5} aria-hidden />
      {NOM_ROLE[role]}
    </span>
  )
}

export function Spinner({ taille = 18 }: { taille?: number }) {
  return <LoaderCircle className="spinner" size={taille} aria-hidden />
}

export function MessageErreur({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="message-erreur" role="alert">
      {children}
    </p>
  )
}

/** Lien qui ouvre l'itinéraire à pied dans Apple Plans. */
export function lienPlans(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat.toFixed(6)},${lng.toFixed(6)}&dirflg=w`
}

// ---------- Listes groupées (style Réglages) ----------

export function Section({ titre, droite, pied, children }: { titre?: string; droite?: ReactNode; pied?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      {titre && (
        <h2 className="section-titre">
          <span>{titre}</span>
          {droite && <span>{droite}</span>}
        </h2>
      )}
      <div className="groupe">{children}</div>
      {pied && <p className="section-pied">{pied}</p>}
    </section>
  )
}

export function Ligne({
  icone: Icone,
  couleur = 'var(--bleu)',
  titre,
  valeur,
  onClick,
}: {
  icone: LucideIcon
  couleur?: string
  titre: string
  valeur?: ReactNode
  onClick?: () => void
}) {
  const contenu = (
    <>
      <span className="ligne-icone" style={{ background: couleur }}>
        <Icone size={18} aria-hidden />
      </span>
      <span className="ligne-corps">
        <span className="ligne-titre">{titre}</span>
      </span>
      {valeur !== undefined && <span className="ligne-valeur">{valeur}</span>}
      {onClick && <ChevronRight size={20} className="ligne-chevron" aria-hidden />}
    </>
  )
  return onClick ? (
    <button className="ligne avec-icone" onClick={onClick}>
      {contenu}
    </button>
  ) : (
    <div className="ligne avec-icone">{contenu}</div>
  )
}

export function Segmente<T extends string>({
  options,
  valeur,
  onChange,
  desactive = false,
  label,
}: {
  options: { valeur: T; label: string; icone?: LucideIcon }[]
  valeur: T
  onChange: (v: T) => void
  desactive?: boolean
  label: string
}) {
  return (
    <div className="segmente" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const Icone = o.icone
        return (
          <button key={o.valeur} role="radio" aria-checked={valeur === o.valeur} className={valeur === o.valeur ? 'actif' : ''} disabled={desactive} onClick={() => onChange(o.valeur)}>
            {Icone && <Icone size={17} aria-hidden />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Interrupteur({ actif, desactive = false, onChange, label }: { actif: boolean; desactive?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={actif} aria-label={label} className={`interrupteur${actif ? ' actif' : ''}`} disabled={desactive} onClick={() => onChange(!actif)}>
      <span />
    </button>
  )
}

// ---------- Feuilles et menus ----------

/** Feuille modale qui monte du bas de l'écran. */
export function Feuille({ titre, onFermer, children, action }: { titre: string; onFermer: () => void; children: ReactNode; action?: ReactNode }) {
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onFermer])
  return (
    <div className="voile" onClick={onFermer}>
      <div className="feuille" role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <div className="feuille-tete">
          <h2>{titre}</h2>
          {action ?? (
            <button className="btn-lien" style={{ fontWeight: 600 }} onClick={onFermer}>
              OK
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

export interface ActionMenu {
  label: string
  icone?: LucideIcon
  danger?: boolean
  onClick: () => void
}

export interface OptionsMenu {
  titre?: string
  message?: string
  icone?: LucideIcon
  couleur?: string
  actions: ActionMenu[]
  annuler?: string
  /** Appelé si le menu est fermé sans choisir d'action. */
  onAnnuler?: () => void
}

/** Menu d'actions iOS (UIAlertController en feuille). */
export function useMenu(): [ReactNode, (o: OptionsMenu) => void] {
  const [options, setOptions] = useState<OptionsMenu | null>(null)
  const fermer = () => {
    options?.onAnnuler?.()
    setOptions(null)
  }
  const Icone = options?.icone
  const element = options ? (
    <div className="voile" onClick={fermer}>
      <div className="menu" role="dialog" aria-modal="true" aria-label={options.titre ?? 'Actions'} onClick={(e) => e.stopPropagation()}>
        <div className="menu-groupe">
          {(options.titre || options.message) && (
            <div className="menu-tete">
              {Icone && (
                <span className="menu-icone" style={{ background: options.couleur ?? 'var(--bleu)' }}>
                  <Icone size={24} aria-hidden />
                </span>
              )}
              {options.titre && <strong>{options.titre}</strong>}
              {options.message && <span>{options.message}</span>}
            </div>
          )}
          {options.actions.map((a) => {
            const I = a.icone
            return (
              <button
                key={a.label}
                className={`menu-action${a.danger ? ' danger' : ''}`}
                onClick={() => {
                  setOptions(null)
                  a.onClick()
                }}
              >
                {I && <I size={20} aria-hidden />}
                {a.label}
              </button>
            )
          })}
        </div>
        <div className="menu-groupe">
          <button className="menu-action annuler" onClick={fermer}>
            {options.annuler ?? 'Annuler'}
          </button>
        </div>
      </div>
    </div>
  ) : null
  return [element, setOptions]
}

export interface OptionsConfirm {
  titre: string
  message: string
  confirmer: string
  danger?: boolean
  icone?: LucideIcon
  couleur?: string
}

/** Confirmation d'une action (menu iOS à une action + Annuler). */
export function useConfirm(): [ReactNode, (o: OptionsConfirm) => Promise<boolean>] {
  const [menu, ouvrir] = useMenu()
  const demander = useCallback(
    (o: OptionsConfirm) =>
      new Promise<boolean>((resolve) => {
        ouvrir({
          titre: o.titre,
          message: o.message,
          icone: o.icone,
          couleur: o.couleur,
          actions: [{ label: o.confirmer, danger: o.danger, onClick: () => resolve(true) }],
          onAnnuler: () => resolve(false),
        })
      }),
    [ouvrir],
  )
  return [menu, demander]
}

/** Exécute une action asynchrone en gérant l'état « occupé » et le message d'erreur. */
export function useAction(): {
  occupe: boolean
  erreur: string | null
  setErreur: (e: string | null) => void
  lancer: (f: () => Promise<void>) => Promise<void>
} {
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const monte = useRef(true)
  useEffect(
    () => () => {
      monte.current = false
    },
    [],
  )
  const lancer = useCallback(async (f: () => Promise<void>) => {
    setOccupe(true)
    setErreur(null)
    try {
      await f()
    } catch (e) {
      if (monte.current) setErreur(e instanceof Error ? e.message : 'Une erreur est survenue')
    } finally {
      if (monte.current) setOccupe(false)
    }
  }, [])
  return { occupe, erreur, setErreur, lancer }
}

// ---------- Règles du jeu ----------

const REGLES: { icone: LucideIcon; couleur: string; titre: string; texte: string }[] = [
  { icone: Footprints, couleur: 'var(--vert)', titre: 'Runners', texte: 'Ils se cachent dans la zone. Au départ, ils ont quelques minutes d’avance.' },
  { icone: Crosshair, couleur: 'var(--orange)', titre: 'Chasseurs', texte: 'Ils traquent les runners. Un runner est attrapé quand un chasseur le touche.' },
  { icone: Radar, couleur: 'var(--bleu)', titre: 'Pings', texte: 'Toutes les quelques minutes, les chasseurs voient où étaient les runners.' },
  { icone: Star, couleur: 'var(--jaune)', titre: 'Points des runners', texte: 'Toutes les 10 s, un runner marque selon le chasseur le plus proche : moins de 50 m = 10 pts, 100 m = 5, 200 m = 2, 500 m = 1. Plus tu frôles les chasseurs sans te faire prendre, plus tu marques.' },
  { icone: Zap, couleur: 'var(--rouge)', titre: 'Joker chasseur', texte: 'Révèle tout de suite la vraie position du runner choisi à tous les chasseurs.' },
  { icone: VenetianMask, couleur: 'var(--violet)', titre: 'Joker runner', texte: 'Choisis sur la carte une fausse position : au prochain ping, les chasseurs te verront là.' },
  { icone: TriangleAlert, couleur: 'var(--rouge)', titre: 'Hors zone', texte: 'Si la limite est activée, un runner hors zone est visible en direct, et attrapé quand son temps dehors est écoulé.' },
  { icone: Flame, couleur: 'var(--orange)', titre: 'Hotspots', texte: 'Rester dans un hotspot fait gagner un joker toutes les 2 min… mais les chasseurs te pingent.' },
  { icone: Hand, couleur: 'var(--gris)', titre: 'Capture', texte: 'Le runner touche « J’ai été attrapé », ou un chasseur le marque. En mode Infection, il devient chasseur.' },
  { icone: Hourglass, couleur: 'var(--indigo)', titre: 'Fin', texte: 'Les chasseurs gagnent s’ils attrapent tout le monde avant la fin du temps, sinon les runners gagnent.' },
  { icone: Moon, couleur: '#1c1c1e', titre: 'Mode poche', texte: 'Écran noir mais app active : ta position continue d’être envoyée. Ne verrouille pas ton téléphone.' },
  { icone: IconeCarte, couleur: 'var(--bleu)', titre: 'Itinéraire', texte: 'La flèche à côté d’un runner ouvre l’itinéraire à pied dans Plans.' },
]

export function FeuilleRegles({ onFermer }: { onFermer: () => void }) {
  return (
    <Feuille titre="Comment jouer" onFermer={onFermer}>
      <div className="groupe">
        {REGLES.map((r) => {
          const I = r.icone
          return (
            <div className="regle" key={r.titre}>
              <span className="ligne-icone" style={{ background: r.couleur }}>
                <I size={18} aria-hidden />
              </span>
              <div>
                <strong>{r.titre}</strong>
                <p>{r.texte}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Feuille>
  )
}
