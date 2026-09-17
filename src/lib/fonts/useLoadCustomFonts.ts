"use client";

import { useEffect, useState } from "react";
import type { CustomFontMeta } from "./types";
import { customFontFaceFamily, customFontFileUrl } from "./registry";

// Module-level cache: once a custom font's FontFace is registered with
// `document.fonts`, every component using this hook (the editor, the
// recipient preview) shares that registration instead of re-fetching and
// re-adding the same font bytes on every mount.
const registeredFontIds = new Set<string>();
let cachedFonts: CustomFontMeta[] | null = null;
let inFlightFetch: Promise<CustomFontMeta[]> | null = null;

async function fetchCustomFonts(): Promise<CustomFontMeta[]> {
  const response = await fetch("/api/fonts");
  if (!response.ok) return [];
  const body = (await response.json()) as { fonts?: CustomFontMeta[] };
  return body.fonts ?? [];
}

async function registerFontFace(font: CustomFontMeta): Promise<void> {
  if (registeredFontIds.has(font.id) || typeof document === "undefined" || !("fonts" in document)) return;

  try {
    const face = new FontFace(customFontFaceFamily(font.id), `url(${customFontFileUrl(font.id)})`, {
      weight: font.fontWeight === "bold" ? "bold" : "normal",
    });
    await face.load();
    document.fonts.add(face);
    registeredFontIds.add(font.id);
  } catch {
    // A font that fails to load in the browser simply never becomes
    // available -- getCssFontFamily's generic fallback stack (sans-serif)
    // takes over visually rather than crashing the editor/preview.
  }
}

export interface UseCustomFontsResult {
  customFonts: CustomFontMeta[];
  loading: boolean;
}

/**
 * Loads every registered custom font into the browser (via the FontFace
 * API, fetching bytes from the server-mediated /api/fonts/:id/file route --
 * never a direct Storage URL) so canvas measurement and on-screen
 * rendering both use the real font. Used by the certificate editor and the
 * recipient preview -- the two browser surfaces that need custom fonts to
 * actually render (item 5 of the font-system spec).
 */
export function useLoadCustomFonts(): UseCustomFontsResult {
  const [customFonts, setCustomFonts] = useState<CustomFontMeta[]>(cachedFonts ?? []);
  const [loading, setLoading] = useState(cachedFonts === null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!inFlightFetch) {
        inFlightFetch = fetchCustomFonts();
      }
      const fonts = await inFlightFetch;
      cachedFonts = fonts;
      await Promise.all(fonts.map(registerFontFace));
      if (!cancelled) {
        setCustomFonts(fonts);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { customFonts, loading };
}
