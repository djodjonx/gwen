/**
 * @gwen/engine-core — String Pool (String Interning)
 *
 * Maintient une correspondance bi-directionnelle entre des chaînes de caractères (string)
 * et des identifiants (ID) d'entiers signés 32-bits (i32).
 *
 * Objectif : Dans une architecture Entity-Component-System (ECS) orientée zéro-allocation,
 * les composants doivent avoir une taille prévisible et fixe en mémoire binaire (ArrayBuffer).
 * Les strings ont une longueur variable. Par conséquent, l'ECS stocke uniquement
 * l'ID `i32` généré par ce dictionnaire.
 */

export class StringPool {
  private strToId = new Map<string, number>();
  private idToStr = new Map<number, string>();
  private nextId = 1; // 0 est historiquement souvent réservé comme "vide" ou "null"

  /**
   * Retourne l'ID unique de la chaîne de caractères.
   * Si la chaîne n'existe pas encore dans le dictionnaire, elle y est insérée.
   */
  public intern(str: string): number {
    let id = this.strToId.get(str);
    if (id === undefined) {
      id = this.nextId++;
      this.strToId.set(str, id);
      this.idToStr.set(id, str);
    }
    return id;
  }

  /**
   * Récupère la chaîne de caractères correspondante à l'ID.
   * Si l'ID n'est pas trouvé, retourne une chaîne vide (ou lève une erreur selon l'usage).
   */
  public get(id: number): string {
    return this.idToStr.get(id) ?? '';
  }

  /**
   * Vide complètement le dictionnaire. Utile uniquement pour les tests ou entre deux scènes si besoin.
   */
  public clear(): void {
    this.strToId.clear();
    this.idToStr.clear();
    this.nextId = 1;
  }
}

// Instance Singleton Globale pour le moteur
export const GlobalStringPool = new StringPool();
