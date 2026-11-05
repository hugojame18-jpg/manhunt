// Accès Supabase : tout ce qui parle au serveur passe par ici.
import { createClient } from '@supabase/supabase-js'
import type { Joueur, Partie, PositionDatee, Role } from './jeu'
import { genererCode } from './jeu'

const url = import.meta.env.VITE_SUPABASE_URL
const cle = import.meta.env.VITE_SUPABASE_KEY

export const supabase = createClient(url, cle, { auth: { persistSession: false } })

export interface Etat {
  now: string
  partie: Partie | null
  joueurs: Joueur[]
}

function erreur(e: { message: string } | null): void {
  if (e) throw new Error(e.message)
}

export async function lireEtat(partieId: string): Promise<Etat> {
  const { data, error } = await supabase.rpc('manhunt_etat', { p_partie: partieId })
  erreur(error)
  return data as Etat
}

export interface ConfigCreation {
  pseudo: string
  zone_lat: number
  zone_lng: number
  zone_rayon_m: number
  duree_min: number
  intervalle_min: number
}

export async function creerPartie(c: ConfigCreation): Promise<{ partie: Partie; joueur: Joueur }> {
  let partie: Partie | null = null
  for (let essai = 0; essai < 5 && !partie; essai++) {
    const { data, error } = await supabase
      .from('manhunt_parties')
      .insert({
        code: genererCode(),
        zone_lat: c.zone_lat,
        zone_lng: c.zone_lng,
        zone_rayon_m: c.zone_rayon_m,
        duree_min: c.duree_min,
        intervalle_min: c.intervalle_min,
      })
      .select()
      .single()
    if (error && error.code !== '23505') erreur(error)
    partie = (data as Partie | null) ?? null
  }
  if (!partie) throw new Error('Impossible de générer un code de partie')
  const joueur = await ajouterJoueur(partie.id, c.pseudo, 'chasseur')
  const { error } = await supabase.from('manhunt_parties').update({ admin_id: joueur.id }).eq('id', partie.id)
  erreur(error)
  return { partie: { ...partie, admin_id: joueur.id }, joueur }
}

async function ajouterJoueur(partieId: string, pseudo: string, role: Role): Promise<Joueur> {
  const { data, error } = await supabase
    .from('manhunt_joueurs')
    .insert({ partie_id: partieId, pseudo, role })
    .select()
    .single()
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
  const { data: existant, error: e2 } = await supabase
    .from('manhunt_joueurs')
    .select()
    .eq('partie_id', partie.id)
    .eq('pseudo', pseudo)
    .maybeSingle()
  erreur(e2)
  if (existant) return { partie, joueur: existant as Joueur }
  if (partie.statut !== 'lobby') throw new Error('La partie a déjà commencé')
  const joueur = await ajouterJoueur(partie.id, pseudo, 'runner')
  return { partie, joueur }
}

export async function changerRole(joueurId: string, role: Role): Promise<void> {
  const { error } = await supabase.from('manhunt_joueurs').update({ role }).eq('id', joueurId)
  erreur(error)
}

export async function retirerJoueur(joueurId: string): Promise<void> {
  const { error } = await supabase.from('manhunt_joueurs').delete().eq('id', joueurId)
  erreur(error)
}

export async function lancerPartie(partieId: string): Promise<void> {
  const { error } = await supabase.rpc('manhunt_lancer', { p_partie: partieId })
  erreur(error)
}

export async function terminerPartie(partieId: string): Promise<void> {
  const { error } = await supabase.rpc('manhunt_terminer', { p_partie: partieId })
  erreur(error)
}

export async function envoyerPosition(partieId: string, joueurId: string, lat: number, lng: number, accuracy: number): Promise<void> {
  const { error } = await supabase
    .from('manhunt_positions')
    .insert({ partie_id: partieId, joueur_id: joueurId, lat, lng, accuracy })
  erreur(error)
}

export async function positionsAvant(partieId: string, avant: number): Promise<PositionDatee[]> {
  const { data, error } = await supabase.rpc('manhunt_positions_avant', {
    p_partie: partieId,
    p_avant: new Date(avant).toISOString(),
  })
  erreur(error)
  return (data as PositionDatee[] | null) ?? []
}

export async function activerFaussePosition(joueurId: string): Promise<void> {
  const { error } = await supabase.rpc('manhunt_bonus_faux', { p_joueur: joueurId })
  erreur(error)
}

export async function positionInstantanee(joueurId: string, cibleId: string): Promise<void> {
  const { error } = await supabase.rpc('manhunt_bonus_instant', { p_joueur: joueurId, p_cible: cibleId })
  erreur(error)
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
