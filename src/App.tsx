import { useEffect, useState } from 'react'
import { BookOpen, Crosshair, WifiOff } from 'lucide-react'
import { creerPartie, rejoindrePartie, terminerPartie } from './api'
import { Jeu } from './EnJeu'
import { useEtatPartie, useMaintenant } from './hooks'
import { estTerminee } from './jeu'
import { Lobby } from './Lobby'
import { Recap } from './Recap'
import { FeuilleRegles, MessageErreur, Section, Spinner, useAction } from './ui'

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
      <div className="page page-centre">
        {erreur ? <WifiOff size={40} aria-hidden /> : <Spinner taille={32} />}
        <p className="aide">{erreur ? `Connexion impossible : ${erreur}` : 'Connexion à la partie…'}</p>
        <button className="btn btn-gris" onClick={onQuitter}>
          Retour à l'accueil
        </button>
      </div>
    )
  }
  if (!partie || !moi) {
    return (
      <div className="page page-centre">
        <h2>{!partie ? "Cette partie n'existe plus" : 'Tu as été retiré de la partie'}</h2>
        <button className="btn btn-plein" onClick={onQuitter}>
          Retour à l'accueil
        </button>
      </div>
    )
  }

  const props = { partie, joueurs: etat.joueurs, evenements: etat.evenements, moi, now, recharger, onQuitter }
  return (
    <>
      {erreur && (
        <div className="toast" role="status">
          <WifiOff size={16} aria-hidden /> Connexion instable…
        </div>
      )}
      {partie.statut === 'lobby' && <Lobby {...props} />}
      {partie.statut === 'en_cours' && !finie && <Jeu {...props} />}
      {finie && <Recap {...props} />}
    </>
  )
}

/** Position actuelle si elle arrive vite (pour centrer la carte du salon), sinon null. */
function positionRapide(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    const t = window.setTimeout(() => resolve(null), 4000)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        window.clearTimeout(t)
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      () => {
        window.clearTimeout(t)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 60_000 },
    )
  })
}

function Accueil({ onEntrer }: { onEntrer: (s: Session) => void }) {
  const codeUrl = new URLSearchParams(location.search).get('code') ?? ''
  const [code, setCode] = useState(codeUrl.toUpperCase())
  const [pseudo, setPseudo] = useState(() => localStorage.getItem('manhunt-pseudo') ?? '')
  const [regles, setRegles] = useState(false)
  const { occupe, erreur, setErreur, lancer } = useAction()
  const [action, setAction] = useState<'rejoindre' | 'creer' | null>(null)

  const pseudoValide = (): string | null => {
    const p = pseudo.trim()
    if (p.length < 2) {
      setErreur('Choisis un pseudo (2 caractères minimum).')
      return null
    }
    localStorage.setItem('manhunt-pseudo', p)
    return p
  }

  const rejoindre = () => {
    const p = pseudoValide()
    if (!p) return
    if (code.trim().length !== 6) return setErreur('Le code de la partie fait 6 caractères.')
    setAction('rejoindre')
    void lancer(async () => {
      const { partie, joueur } = await rejoindrePartie(code.trim().toUpperCase(), p)
      history.replaceState(null, '', location.pathname)
      onEntrer({ partieId: partie.id, joueurId: joueur.id })
    })
  }

  const creer = () => {
    const p = pseudoValide()
    if (!p) return
    setAction('creer')
    void lancer(async () => {
      const centre = await positionRapide()
      const { partie, joueur } = await creerPartie(p, centre)
      onEntrer({ partieId: partie.id, joueurId: joueur.id })
    })
  }

  return (
    <div className="page">
      {regles && <FeuilleRegles onFermer={() => setRegles(false)} />}
      <header className="hero">
        <div className="hero-icone">
          <Crosshair size={48} strokeWidth={2.2} aria-hidden />
        </div>
        <h1>Manhunt</h1>
        <p>La chasse à l'homme entre potes</p>
      </header>

      <form
        className="section"
        style={{ gap: 22 }}
        onSubmit={(e) => {
          e.preventDefault()
          rejoindre()
        }}
      >
        <Section titre="Ton pseudo">
          <label className="ligne">
            <input className="champ-ligne" value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={20} placeholder="Ex. Léo" autoComplete="nickname" aria-label="Ton pseudo" />
          </label>
        </Section>
        <Section titre="Code de la partie" pied="Demande le code à celui qui a créé la partie.">
          <label className="ligne">
            <input
              className="champ-ligne champ-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABC123"
              aria-label="Code de la partie"
            />
          </label>
        </Section>
        <MessageErreur>{erreur}</MessageErreur>
        <div className="section" style={{ gap: 10 }}>
          <button type="submit" className="btn btn-plein" disabled={occupe}>
            {occupe && action === 'rejoindre' && <Spinner />}
            Rejoindre la partie
          </button>
          <button type="button" className="btn btn-teinte" onClick={creer} disabled={occupe}>
            {occupe && action === 'creer' && <Spinner />}
            Créer une partie
          </button>
        </div>
      </form>

      <button className="btn-lien" style={{ alignSelf: 'center', marginTop: 'auto' }} onClick={() => setRegles(true)}>
        <BookOpen size={18} aria-hidden /> Comment jouer ?
      </button>
    </div>
  )
}
