// Accès Supabase : tout ce qui parle au serveur passe par ici.
import { createClient } from '@supabase/supabase-js'
import type { Evenement, Joueur, Partie, PositionDatee, Role } from './jeu'
import { MAX_JOUEURS, genererCode } from './jeu'

const url = import.meta.env.VITE_SUPABASE_URL
const cle = import.meta.env.VITE_SUPABASE_KEY

export const supabase = createClient(url, cle, { auth: { persistSession: false } })

export interface Etat {
  now: string
  partie: Partie | null
  joueurs: Joueur[]
  evenements: Evenement[]
}

function erreur(e: { message: string } | null): void {
  if (e) throw new Error(e.message)
}

export async function lireEtat(partieId: string): Promise<Etat> {
  const { data, error } = await supabase.rpc('manhunt_etat', { p_partie: partieId })
  erreur(error)
  return data as Etat
}

/** Crée un salon : les réglages se font ensuite dans le salon par l'hôte. */
export async function creerPartie(pseudo: string, centre: { lat: number; lng: number } | null): Promise<{ partie: Partie; joueur: Joueur }> {
  let partie: Partie | null = null
  for (let essai = 0; essai < 5 && !partie; essai++) {
    const { data, error } = await supabase
      .from('manhunt_parties')
      .insert({ code: genererCode(), zone_lat: centre?.lat ?? 48.8566, zone_lng: centre?.lng ?? 2.3522 })
      .select()
      .single()
    if (error && error.code !== '23505') erreur(error)
    partie = (data as Partie | null) ?? null
  }
  if (!partie) throw new Error('Impossible de générer un code de partie')
  const joueur = await ajouterJoueur(partie.id, pseudo, 'chasseur')
  const { error } = await supabase.from('manhunt_parties').update({ admin_id: joueur.id }).eq('id', partie.id)
  erreur(error)
  return { partie: { ...partie, admin_id: joueur.id }, joueur }
}

async function ajouterJoueur(partieId: string, pseudo: string, role: Role): Promise<Joueur> {
  const { data, error } = await supabase.from('manhunt_joueurs').insert({ partie_id: partieId, pseudo, role }).select().single()
  if (error?.code === '23505') throw new Error('Ce pseudo est déjà pris dans cette partie')
  erreur(error)
  return data as Joueur
}

/** Rejoint une partie. Si le pseudo existe déjà, on reprend ce joueur (utile si Safari a perdu la session). */
export async function rejoindrePartie(code: string, pseudo: string): Promise<{ partie: Partie; joueur: Joueur }> {
  const { data, error } = await supabase.from('manhunt_parties').select().eq('code', code).maybeSingle()
  erreur(error)
  const partie = data as Partie | null
  if (!partie) throw new Error('Aucune partie avec ce code')
  const { data: joueurs, error: e2 } = await supabase.from('manhunt_joueurs').select().eq('partie_id', partie.id)
  erreur(e2)
  const liste = (joueurs as Joueur[] | null) ?? []
  const existant = liste.find((j) => j.pseudo.toLowerCase() === pseudo.toLowerCase())
  if (existant) return { partie, joueur: existant }
  if (partie.statut !== 'lobby') throw new Error('La partie a déjà commencé')
  if (liste.length >= MAX_JOUEURS) throw new Error(`La partie est pleine (${MAX_JOUEURS} joueurs)`)
  const joueur = await ajouterJoueur(partie.id, pseudo, 'runner')
  return { partie, joueur }
}

export type ReglagesPartie = Partial<
  Pick<
    Partie,
    'mode' | 'duree_min' | 'intervalle_min' | 'avance_min' | 'jokers_chasseur' | 'jokers_runner' | 'zone_poly' | 'limite_dehors' | 'dehors_max_min' | 'hotspots' | 'zone_lat' | 'zone_lng'
  >
>

export async function modifierPartie(partieId: string, reglages: ReglagesPartie): Promise<void> {
  const { error } = await supabase.from('manhunt_parties').update(reglages).eq('id', partieId).eq('statut', 'lobby')
  erreur(error)
}

export async function changerRole(joueurId: string, role: Role): Promise<void> {
  const { error } = await supabase.from('manhunt_joueurs').update({ role }).eq('id', joueurId)
  erreur(error)
}

export async function retirerJoueur(joueurId: string): Promise<void> {
  const { error } = await supabase.from('manhunt_joueurs').delete().eq('id', joueurId)
  erreur(error)
}

async function rpc(nom: string, params: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(nom, params)
  erreur(error)
  return data
}

export const lancerPartie = (partieId: string) => rpc('manhunt_lancer', { p_partie: partieId }).then(() => undefined)
export const terminerPartie = (partieId: string) => rpc('manhunt_terminer', { p_partie: partieId }).then(() => undefined)
export const attraper = (joueurId: string) => rpc('manhunt_attraper', { p_joueur: joueurId }).then(() => undefined)
/** Joker chasseur : ping réel immédiat du runner choisi. */
export const jokerPing = (chasseurId: string, cibleId: string) => rpc('manhunt_joker_ping', { p_chasseur: chasseurId, p_cible: cibleId }).then(() => undefined)
/** Joker runner : le prochain ping montrera une fausse position. */
export const jokerFaux = (runnerId: string) => rpc('manhunt_joker_faux', { p_runner: runnerId }).then(() => undefined)

export function envoyerPosition(
  joueurId: string,
  pos: { lat: number; lng: number; accuracy: number },
  dehors: boolean,
  hotspot: number | null,
): Promise<unknown> {
  return rpc('manhunt_position', {
    p_joueur: joueurId,
    p_lat: pos.lat,
    p_lng: pos.lng,
    p_acc: pos.accuracy,
    p_dehors: dehors,
    p_hotspot: hotspot,
  })
}

export async function positionsAvant(partieId: string, avant: number): Promise<PositionDatee[]> {
  const data = await rpc('manhunt_positions_avant', { p_partie: partieId, p_avant: new Date(avant).toISOString() })
  return (data as PositionDatee[] | null) ?? []
}

/** Toutes les positions de la partie (pour le récap), par pages de 1000. */
export async function toutesPositions(partieId: string): Promise<PositionDatee[]> {
  const res: PositionDatee[] = []
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase
      .from('manhunt_positions')
      .select('joueur_id, lat, lng, created_at')
      .eq('partie_id', partieId)
      .order('created_at')
      .range(debut, debut + 999)
    erreur(error)
    const page = (data as PositionDatee[] | null) ?? []
    res.push(...page)
    if (page.length < 1000) return res
  }
}
