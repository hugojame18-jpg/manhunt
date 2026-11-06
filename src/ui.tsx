// Petits composants d'interface partagés.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Crosshair, Footprints, LoaderCircle, type LucideIcon } from 'lucide-react'
import type { Role } from './jeu'

export const COULEUR_ROLE: Record<Role, string> = { runner: '#059669', chasseur: '#EA580C' }
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
      <Icone size={16} strokeWidth={2.5} aria-hidden />
      {NOM_ROLE[role]}
    </span>
  )
}

export function Spinner({ taille = 18 }: { taille?: number }) {
  return <LoaderCircle className="spinner" size={taille} aria-hidden />
}

export interface OptionsConfirm {
  titre: string
  message: string
  confirmer: string
  ton?: 'normal' | 'danger' | 'violet' | 'rouge'
  icone?: LucideIcon
  /** Simple information : un seul bouton OK. */
  info?: boolean
}

/** Fenêtre de confirmation intégrée (remplace confirm() de Safari). */
export function useConfirm(): [ReactNode, (o: OptionsConfirm) => Promise<boolean>] {
  const [options, setOptions] = useState<OptionsConfirm | null>(null)
  const resolveur = useRef<((v: boolean) => void) | null>(null)

  const demander = useCallback(
    (o: OptionsConfirm) =>
      new Promise<boolean>((resolve) => {
        resolveur.current = resolve
        setOptions(o)
      }),
    [],
  )

  const fermer = (v: boolean) => {
    resolveur.current?.(v)
    resolveur.current = null
    setOptions(null)
  }

  const Icone = options?.icone
  const element = options ? (
    <div className="voile" onClick={() => fermer(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titre" onClick={(e) => e.stopPropagation()}>
        {Icone && (
          <span className={`modal-icone ton-${options.ton ?? 'normal'}`}>
            <Icone size={26} aria-hidden />
          </span>
        )}
        <h2 id="modal-titre">{options.titre}</h2>
        <p>{options.message}</p>
        {options.info ? (
          <button className="btn btn-primaire" style={{ marginTop: 10 }} onClick={() => fermer(true)}>
            {options.confirmer}
          </button>
        ) : (
          <div className="modal-actions">
            <button className="btn btn-secondaire" onClick={() => fermer(false)}>
              Annuler
            </button>
            <button className={`btn btn-${options.ton === 'normal' || !options.ton ? 'primaire' : options.ton}`} onClick={() => fermer(true)}>
              {options.confirmer}
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null

  return [element, demander]
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
