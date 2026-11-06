import { useCallback, useEffect, useRef, useState } from 'react'
import { lireEtat, type Etat } from './api'
import { parseTs } from './jeu'

/** Heure courante corrigée de l'écart avec l'horloge du serveur, rafraîchie chaque seconde. */
export function useMaintenant(decalage: number): number {
  const [now, setNow] = useState(() => Date.now() + decalage)
  useEffect(() => {
    setNow(Date.now() + decalage)
    const id = window.setInterval(() => setNow(Date.now() + decalage), 1000)
    return () => window.clearInterval(id)
  }, [decalage])
  return now
}

/** Relit l'état de la partie toutes les 3 s, et dès que l'app revient au premier plan. */
export function useEtatPartie(partieId: string): {
  etat: Etat | null
  decalage: number
  erreur: string | null
  recharger: () => Promise<void>
} {
  const [etat, setEtat] = useState<Etat | null>(null)
  const [decalage, setDecalage] = useState(0)
  const [erreur, setErreur] = useState<string | null>(null)

  const recharger = useCallback(async () => {
    try {
      const avant = Date.now()
      const e = await lireEtat(partieId)
      const apres = Date.now()
      setDecalage(parseTs(e.now) - (avant + apres) / 2)
      setEtat(e)
      setErreur(null)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Connexion perdue')
    }
  }, [partieId])

  useEffect(() => {
    void recharger()
    const id = window.setInterval(() => void recharger(), 3000)
    const auRetour = () => {
      if (document.visibilityState === 'visible') void recharger()
    }
    document.addEventListener('visibilitychange', auRetour)
    window.addEventListener('online', auRetour)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', auRetour)
      window.removeEventListener('online', auRetour)
    }
  }, [recharger])

  return { etat, decalage, erreur, recharger }
}

export interface Geoloc {
  position: { lat: number; lng: number; accuracy: number } | null
  precise: boolean
  erreur: string | null
}

export const PRECISION_MAX_M = 50

/** Suit la position GPS du téléphone. Les positions à plus de 50 m de précision sont marquées imprécises. */
export function useGeoloc(actif: boolean): Geoloc {
  const [etat, setEtat] = useState<Geoloc>({ position: null, precise: false, erreur: null })
  useEffect(() => {
    if (!actif) return
    if (!('geolocation' in navigator)) {
      setEtat({ position: null, precise: false, erreur: "Ce navigateur ne donne pas accès à la position." })
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) =>
        setEtat({
          position: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy },
          precise: p.coords.accuracy <= PRECISION_MAX_M,
          erreur: null,
        }),
      (e) =>
        setEtat((s) => ({
          ...s,
          erreur:
            e.code === e.PERMISSION_DENIED
              ? "Position refusée. Réglages › Confidentialité › Service de localisation › Sites web Safari : « Lorsque l'app est active », puis recharge."
              : 'Position GPS indisponible pour le moment…',
        })),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [actif])
  return etat
}

/** Empêche l'écran de se mettre en veille quand c'est possible (Safari iOS 16.4+). */
export function useWakeLock(actif: boolean): void {
  const verrou = useRef<WakeLockSentinel | null>(null)
  useEffect(() => {
    if (!actif || !('wakeLock' in navigator)) return
    let annule = false
    const demander = async () => {
      try {
        if (document.visibilityState === 'visible' && !annule) {
          verrou.current = await navigator.wakeLock.request('screen')
        }
      } catch {
        // pas grave : l'avertissement « garde l'écran allumé » reste affiché
      }
    }
    void demander()
    const auRetour = () => {
      if (!verrou.current || verrou.current.released) void demander()
    }
    // Safari exige parfois un geste : on redemande au premier toucher.
    document.addEventListener('visibilitychange', auRetour)
    document.addEventListener('pointerdown', auRetour)
    return () => {
      annule = true
      document.removeEventListener('visibilitychange', auRetour)
      document.removeEventListener('pointerdown', auRetour)
      void verrou.current?.release()
      verrou.current = null
    }
  }, [actif])
}
