import { useEffect, useState } from 'react'
import { creerPartie, rejoindrePartie, terminerPartie } from './api'
import { Carte } from './Carte'
import { useEtatPartie, useGeoloc, useMaintenant } from './hooks'
import type { LatLng } from './jeu'
import { estTerminee } from './jeu'
import { Lobby } from './Lobby'
import { Jeu } from './EnJeu'
import { Recap } from './Recap'

interface Session {
  partieId: string
  joueurId: string
}

const CLE_SESSION = 'manhunt-session'

function lireSession(): Session | null {
  try {
    const s = localStorage.getItem(CLE_SESSION)
    return s ? (JSON.parse(s) as Session) : null
  } catch {
    return null
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(lireSession)

  const ouvrir = (s: Session | null) => {
    if (s) localStorage.setItem(CLE_SESSION, JSON.stringify(s))
    else localStorage.removeItem(CLE_SESSION)
    setSession(s)
  }

  if (!session) return <Accueil onEntrer={ouvrir} />
  return <EcranPartie key={session.partieId} session={session} onQuitter={() => ouvrir(null)} />
}

function EcranPartie({ session, onQuitter }: { session: Session; onQuitter: () => void }) {
  const { etat, decalage, erreur, recharger } = useEtatPartie(session.partieId)
  const now = useMaintenant(decalage)
  const partie = etat?.partie ?? null
  const moi = etat?.joueurs.find((j) => j.id === session.joueurId) ?? null
  const finie = partie ? estTerminee(partie, now) : false

  // Fin automatique : le premier téléphone qui voit l'heure dépassée clôt la partie.
  useEffect(() => {
    if (partie && partie.statut === 'en_cours' && finie) void terminerPartie(partie.id).catch(() => undefined)
  }, [partie, finie])

  if (!etat) {
    return (
      <div className="page centre">
        <p>{erreur ?? 'Chargement…'}</p>
        <button className="secondaire" onClick={onQuitter}>
          Retour à l'accueil
        </button>
      </div>
    )
  }
  if (!partie || !moi) {
    return (
      <div className="page centre">
        <p>{!partie ? "Cette partie n'existe plus." : "Tu as été retiré de la partie."}</p>
        <button onClick={onQuitter}>Retour à l'accueil</button>
      </div>
    )
  }

  const props = { partie, joueurs: etat.joueurs, moi, now, recharger, onQuitter }
  return (
    <>
      {erreur && <div className="bandeau rouge">Connexion instable : {erreur}</div>}
      {partie.statut === 'lobby' && <Lobby {...props} />}
      {partie.statut === 'en_cours' && !finie && <Jeu {...props} />}
      {finie && <Recap {...props} />}
    </>
  )
}

function Accueil({ onEntrer }: { onEntrer: (s: Session) => void }) {
  const codeUrl = new URLSearchParams(location.search).get('code') ?? ''
  const [mode, setMode] = useState<'choix' | 'creer'>('choix')
  const [code, setCode] = useState(codeUrl.toUpperCase())
  const [pseudo, setPseudo] = useState(() => localStorage.getItem('manhunt-pseudo') ?? '')
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  const memoriserPseudo = (p: string) => localStorage.setItem('manhunt-pseudo', p)

  const rejoindre = async () => {
    const p = pseudo.trim()
    if (code.trim().length !== 6 || p.length < 2) {
      setErreur('Il faut un code à 6 caractères et un pseudo (2 caractères minimum).')
      return
    }
    setOccupe(true)
    setErreur(null)
    try {
      const { partie, joueur } = await rejoindrePartie(code.trim().toUpperCase(), p)
      memoriserPseudo(p)
      history.replaceState(null, '', location.pathname)
      onEntrer({ partieId: partie.id, joueurId: joueur.id })
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setOccupe(false)
    }
  }

  if (mode === 'creer') {
    return (
      <Creation
        pseudoInitial={pseudo}
        onAnnuler={() => setMode('choix')}
        onCree={(s, p) => {
          memoriserPseudo(p)
          onEntrer(s)
        }}
      />
    )
  }

  return (
    <div className="page">
      <h1>Manhunt</h1>
      <p className="sous-titre">Chasse à l'homme entre potes</p>

      <section className="carton">
        <h2>Rejoindre une partie</h2>
        <label>
          Code de la partie
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            placeholder="ABC123"
            className="code-input"
          />
        </label>
        <label>
          Ton pseudo
          <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={20} placeholder="Pseudo" />
        </label>
        <button onClick={() => void rejoindre()} disabled={occupe}>
          Rejoindre
        </button>
      </section>

      <section className="carton">
        <h2>Nouvelle partie</h2>
        <button className="secondaire" onClick={() => setMode('creer')}>
          Créer une partie
        </button>
      </section>

      {erreur && <p className="erreur">{erreur}</p>}
    </div>
  )
}

function Creation({
  pseudoInitial,
  onAnnuler,
  onCree,
}: {
  pseudoInitial: string
  onAnnuler: () => void
  onCree: (s: Session, pseudo: string) => void
}) {
  const geo = useGeoloc(true)
  const [pseudo, setPseudo] = useState(pseudoInitial)
  const [centre, setCentre] = useState<LatLng | null>(null)
  const [rayon, setRayon] = useState(500)
  const [duree, setDuree] = useState(30)
  const [intervalle, setIntervalle] = useState(5)
  const [recadrer, setRecadrer] = useState(0)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  // Par défaut, la zone est centrée sur ma position dès qu'elle est connue.
  useEffect(() => {
    if (!centre && geo.position) {
      setCentre({ lat: geo.position.lat, lng: geo.position.lng })
      setRecadrer((r) => r + 1)
    }
  }, [centre, geo.position])

  const creer = async () => {
    const p = pseudo.trim()
    if (p.length < 2) return setErreur('Choisis un pseudo (2 caractères minimum).')
    if (!centre) return setErreur('Touche la carte pour placer le centre de la zone.')
    if (intervalle >= duree) return setErreur("L'intervalle entre les révélations doit être plus court que la partie.")
    setOccupe(true)
    setErreur(null)
    try {
      const { partie, joueur } = await creerPartie({
        pseudo: p,
        zone_lat: centre.lat,
        zone_lng: centre.lng,
        zone_rayon_m: rayon,
        duree_min: duree,
        intervalle_min: intervalle,
      })
      onCree({ partieId: partie.id, joueurId: joueur.id }, p)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur')
      setOccupe(false)
    }
  }

  return (
    <div className="page jeu">
      <div className="entete">
        <button className="lien" onClick={onAnnuler}>
          ‹ Retour
        </button>
        <strong>Nouvelle partie</strong>
        <span />
      </div>
      <p className="aide">Touche la carte pour placer le centre de la zone de jeu.</p>
      <Carte
        zone={centre ? { centre, rayon } : null}
        marqueurs={geo.position ? [{ id: 'moi', pos: geo.position, couleur: '#2563eb', rayon: 8 }] : []}
        onClic={setCentre}
        recadrer={recadrer}
      />
      <div className="panneau">
        <label>
          Ton pseudo
          <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={20} />
        </label>
        <label>
          Rayon de la zone : <strong>{rayon} m</strong>
          <input
            type="range"
            min={100}
            max={3000}
            step={50}
            value={rayon}
            onChange={(e) => setRayon(Number(e.target.value))}
            onPointerUp={() => setRecadrer((r) => r + 1)}
          />
        </label>
        <div className="ligne">
          <label>
            Durée (min)
            <select value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
              {[5, 10, 15, 20, 30, 45, 60, 90, 120].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Révélation toutes les (min)
            <select value={intervalle} onChange={(e) => setIntervalle(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 8, 10, 15].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        {geo.erreur && <p className="erreur">{geo.erreur}</p>}
        {erreur && <p className="erreur">{erreur}</p>}
        <button onClick={() => void creer()} disabled={occupe}>
          Créer la partie
        </button>
      </div>
    </div>
  )
}
