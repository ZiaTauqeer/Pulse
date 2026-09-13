/**
 * PULSE type system - three typefaces, three distinct jobs, never mixed:
 *
 *   - Newsreader (serif): editorial weight. The wordmark, page titles, and
 *     large hero/KPI numerals. Carries the "research report" feel.
 *   - Archivo (grotesk sans): interface text. Nav, body copy, table cells,
 *     buttons, form labels - everything that needs to move fast and stay
 *     out of the way.
 *   - IBM Plex Mono: reserved strictly for metrics, IDs, timestamps, and
 *     model version strings (see spec section 8) - never used for full
 *     paragraphs or UI chrome.
 *
 * Deliberately not Inter, Geist, or Space Grotesk (excluded by the design
 * brief) and not the most predictable "avoid Inter" replacement either -
 * see ml/README.md-style reasoning in the top-level design notes.
 */
import { Archivo, IBM_Plex_Mono, Newsreader } from "next/font/google";

export const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const fontVariables = `${newsreader.variable} ${archivo.variable} ${plexMono.variable}`;
