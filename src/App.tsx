import { useEffect, useState } from 'react'
import { Crosshair, LogIn, Plus, Smartphone, WifiOff } from 'lucide-react'
import { creerPartie, rejoindrePartie, terminerPartie } from './api'
import { Jeu } from './EnJeu'
import { useEtatPartie, useMaintenant } from './hooks'
import { estTerminee } from './jeu'
import { Lobby } from './Lobby'
import { Recap } from './Recap'
import { MessageErreur, Spinner, useAction } from './ui'

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
        {erreur ? <WifiOff size={36} aria-hidden /> : <Spinner taille={32} />}
        <p className="aide">{erreur ? `Connexion impossible : ${erreur}` : 'Connexion à la partie…'}</p>
        <button className="btn btn-secondaire" onClick={onQuitter}>
          Retour à l'accueil
        </button>
      </div>
    )
  }
  if (!partie || !moi) {
    return (
      <div className="page page-centre">
        <h2>{!partie ? "Cette partie n'existe plus" : 'Tu as été retiré de la partie'}</h2>
        <button className="btn btn-primaire" onClick={onQuitter}>
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
  const rejoindre = useAction()
  const creer = useAction()

  const pseudoValide = (): string | null => {
    const p = pseudo.trim()
    if (p.length < 2) return null
    localStorage.setItem('manhunt-pseudo', p)
    return p
  }

  const surRejoindre = () => {
    const p = pseudoValide()
    if (!p) return rejoindre.setErreur('Choisis un pseudo (2 caractères minimum).')
    if (code.trim().length !== 6) return rejoindre.setErreur('Le code de la partie fait 6 caractères.')
    void rejoindre.lancer(async () => {
      const { partie, joueur } = await rejoindrePartie(code.trim().toUpperCase(), p)
      history.replaceState(null, '', location.pathname)
      onEntrer({ partieId: partie.id, joueurId: joueur.id })
    })
  }

  const surCreer = () => {
    const p = pseudoValide()
    if (!p) return creer.setErreur('Choisis un pseudo (2 caractères minimum).')
    void creer.lancer(async () => {
      const centre = await positionRapide()
      const { partie, joueur } = await creerPartie(p, centre)
      onEntrer({ partieId: partie.id, joueurId: joueur.id })
    })
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="radar" aria-hidden />
        <div className="logo">
          <Crosshair size={38} strokeWidth={2.2} aria-hidden />
        </div>
        <h1>Manhunt</h1>
        <p>La chasse à l'homme entre potes</p>
      </header>

      <section className="bloc">
        <label className="champ">
          <span>Ton pseudo</span>
          <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={20} placeholder="Ex. Léo" autoComplete="nickname" />
        </label>
      </section>

      <form
        className="bloc"
        onSubmit={(e) => {
          e.preventDefault()
          surRejoindre()
        }}
      >
        <div className="bloc-titre">
          <h2>Rejoindre une partie</h2>
        </div>
        <label className="champ champ-code">
          <span>Code de la partie</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="······"
          />
        </label>
        <MessageErreur>{rejoindre.erreur}</MessageErreur>
        <button type="submit" className="btn btn-primaire" disabled={rejoindre.occupe}>
          {rejoindre.occupe ? <Spinner /> : <LogIn size={20} aria-hidden />}
          Rejoindre
        </button>
      </form>

      <div className="separateur">ou</div>

      <MessageErreur>{creer.erreur}</MessageErreur>
      <button className="btn btn-secondaire" onClick={surCreer} disabled={creer.occupe}>
        {creer.occupe ? <Spinner /> : <Plus size={20} aria-hidden />}
        Créer une partie
      </button>

      <p className="note" style={{ marginTop: 'auto' }}>
        <Smartphone size={18} aria-hidden />
        Pendant la partie, garde Safari ouvert. Le mode poche éteint l'écran sans couper la position.
      </p>
    </div>
  )
}
