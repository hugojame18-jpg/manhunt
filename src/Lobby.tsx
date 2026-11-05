import { useState } from 'react'
import { changerRole, lancerPartie, retirerJoueur } from './api'
import type { Joueur, Partie, Role } from './jeu'
import { peutLancer } from './jeu'

export interface PropsEcran {
  partie: Partie
  joueurs: Joueur[]
  moi: Joueur
  now: number
  recharger: () => Promise<void>
  onQuitter: () => void
}

export function Lobby({ partie, joueurs, moi, recharger, onQuitter }: PropsEcran) {
  const [erreur, setErreur] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)
  const admin = partie.admin_id === moi.id
  const lienPartage = `${location.origin}${location.pathname}?code=${partie.code}`
  const nomAdmin = joueurs.find((j) => j.id === partie.admin_id)?.pseudo ?? "l'admin"

  const agir = async (action: () => Promise<void>) => {
    setErreur(null)
    try {
      await action()
      await recharger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(partie.code)
      setCopie(true)
      window.setTimeout(() => setCopie(false), 1500)
    } catch {
      setErreur('Copie impossible, note le code à la main.')
    }
  }

  const partager = async () => {
    try {
      await navigator.share({ title: 'Manhunt', text: `Rejoins ma partie de Manhunt (code ${partie.code})`, url: lienPartage })
    } catch {
      // partage annulé
    }
  }

  const basculer = (j: Joueur): Role => (j.role === 'runner' ? 'chasseur' : 'runner')

  return (
    <div className="page">
      <section className="carton centre">
        <p className="petit">Code de la partie</p>
        <p className="code">{partie.code}</p>
        <div className="ligne">
          <button className="secondaire" onClick={() => void copier()}>
            {copie ? 'Copié ✓' : 'Copier'}
          </button>
          {'share' in navigator && (
            <button className="secondaire" onClick={() => void partager()}>
              Partager
            </button>
          )}
        </div>
        <p className="petit">
          Zone de {partie.zone_rayon_m} m · {partie.duree_min} min · révélation toutes les {partie.intervalle_min} min
        </p>
      </section>

      <section className="carton">
        <h2>Ton rôle</h2>
        <div className="ligne">
          {(['runner', 'chasseur'] as const).map((r) => (
            <button
              key={r}
              className={moi.role === r ? '' : 'secondaire'}
              onClick={() => void agir(() => changerRole(moi.id, r))}
            >
              {r === 'runner' ? '🏃 Runner' : '🔎 Chasseur'}
            </button>
          ))}
        </div>
      </section>

      <section className="carton">
        <h2>Joueurs ({joueurs.length})</h2>
        <ul className="liste">
          {joueurs.map((j) => (
            <li key={j.id}>
              <span>
                {j.role === 'runner' ? '🏃' : '🔎'} <strong>{j.pseudo}</strong>
                {j.id === partie.admin_id && <span className="badge">admin</span>}
                {j.id === moi.id && <span className="badge">toi</span>}
              </span>
              {admin && j.id !== moi.id && (
                <span className="actions">
                  <button className="mini secondaire" onClick={() => void agir(() => changerRole(j.id, basculer(j)))}>
                    → {basculer(j)}
                  </button>
                  <button
                    className="mini danger"
                    onClick={() => {
                      if (confirm(`Retirer ${j.pseudo} ?`)) void agir(() => retirerJoueur(j.id))
                    }}
                  >
                    ✕
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {erreur && <p className="erreur">{erreur}</p>}

      {admin ? (
        <>
          <button disabled={!peutLancer(joueurs)} onClick={() => void agir(() => lancerPartie(partie.id))}>
            Lancer la partie
          </button>
          {!peutLancer(joueurs) && <p className="aide centre">Il faut au moins 1 runner et 1 chasseur.</p>}
        </>
      ) : (
        <p className="aide centre">En attente du lancement par {nomAdmin}…</p>
      )}

      <p className="aide centre">
        Garde l'écran allumé et Safari ouvert pendant la partie : la position s'arrête quand le téléphone est verrouillé.
      </p>

      <button
        className="lien"
        onClick={() => {
          if (!confirm('Quitter la partie ?')) return
          if (!admin) void retirerJoueur(moi.id).catch(() => undefined)
          onQuitter()
        }}
      >
        Quitter la partie
      </button>
    </div>
  )
}
