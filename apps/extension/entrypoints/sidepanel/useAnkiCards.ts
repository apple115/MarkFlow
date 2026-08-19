import { useState, useEffect, useCallback } from 'react';
import { log } from './logger';

export type AnkiCard = {
  id: string;
  front: string;
  back: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

const ANKI_CARDS_KEY = 'markflow_anki_cards';

export async function loadAnkiCards(): Promise<AnkiCard[]> {
  try {
    const result = await browser.storage.local.get(ANKI_CARDS_KEY);
    const raw = result[ANKI_CARDS_KEY];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => ({
        ...item,
        tags: Array.isArray(item.tags) ? item.tags.filter((t: unknown): t is string => typeof t === 'string') : [],
      }))
      .filter(
        (item): item is AnkiCard =>
          item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.front === 'string' &&
          typeof item.back === 'string' &&
          Array.isArray(item.tags) &&
          typeof item.createdAt === 'number' &&
          typeof item.updatedAt === 'number',
      );
  } catch (err) {
    log.warn('Failed to load Anki cards:', err);
    return [];
  }
}

export async function saveAnkiCards(cards: AnkiCard[]): Promise<void> {
  await browser.storage.local.set({ [ANKI_CARDS_KEY]: cards });
}

export function parseTags(input: string): string[] {
  return input
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function formatTags(tags: string[]): string {
  return tags.join(', ');
}

export function createAnkiCard(front: string, back: string, tags: string[] = []): AnkiCard {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    front: front.trim(),
    back: back.trim(),
    tags: tags.map((t) => t.trim()).filter(Boolean),
    createdAt: now,
    updatedAt: now,
  };
}

export type UseAnkiCardsReturn = {
  cards: AnkiCard[];
  loading: boolean;
  addCard: (front: string, back: string, tags?: string[]) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  updateCard: (id: string, patch: { front?: string; back?: string; tags?: string[] }) => Promise<void>;
};

export function useAnkiCards(): UseAnkiCardsReturn {
  const [cards, setCards] = useState<AnkiCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnkiCards()
      .then(setCards)
      .catch((err) => log.error('useAnkiCards load error:', err))
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback((next: AnkiCard[]) => {
    setCards(next);
    saveAnkiCards(next).catch((err) => log.warn('Anki cards save failed:', err));
  }, []);

  const addCard = useCallback(async (front: string, back: string, tags?: string[]) => {
    if (!front.trim() && !back.trim()) return;
    const card = createAnkiCard(front, back, tags);
    setCards((prev) => {
      const next = [card, ...prev];
      saveAnkiCards(next).catch((err) => log.warn('Anki cards save failed:', err));
      return next;
    });
  }, []);

  const deleteCard = useCallback(async (id: string) => {
    setCards((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveAnkiCards(next).catch((err) => log.warn('Anki cards save failed:', err));
      return next;
    });
  }, []);

  const updateCard = useCallback(async (id: string, patch: { front?: string; back?: string; tags?: string[] }) => {
    setCards((prev) => {
      const next = prev.map((c) =>
        c.id === id
          ? { ...c, ...patch, updatedAt: Date.now() }
          : c,
      );
      saveAnkiCards(next).catch((err) => log.warn('Anki cards save failed:', err));
      return next;
    });
  }, []);

  return { cards, loading, addCard, deleteCard, updateCard };
}
