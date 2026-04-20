// Points of Interest for God's Eye.
// Click a POI in the sidebar → camera flies to it Google-Earth style.
//
// Field guide:
//   lat, lon  — WGS84 decimal degrees (Google Maps: right-click → "What's here?").
//   altitude  — camera height above the target, in METERS.
//                 ~400    → street-level, you can read shop signs
//                 ~1500   → neighborhood / city block
//                 ~8000   → whole city
//                 ~50000  → regional / metro sprawl
//                 ~500000 → continental
//   heading   — 0=north, 90=east, 180=south, 270=west. Which way the camera faces.
//   pitch     — -90 is straight down (map view), -30 to -45 is the cinematic
//               Google-Earth oblique that looks like a spy movie. 0 is horizon.
//   tag       — purely cosmetic, used to color the POI in the HUD.

export type POI = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  altitude: number;
  heading?: number;
  pitch?: number;
  tag?: 'home' | 'work' | 'target' | 'asset' | 'threat';
};

// TODO(danny): replace these with your real locations.
// Think: home (Dancave), Wavelength client sites, any demo "targets"
// you want to zoom into when showing off the HUD.
// Start with 5–10. You can always add more — this is just a TypeScript array.
export const POIS: POI[] = [
  {
    id: 'nyc-times-sq',
    name: 'New York — Times Square',
    lat: 40.7580,
    lon: -73.9855,
    altitude: 1200,
    heading: 0,
    pitch: -40,
    tag: 'target',
  },
  {
    id: 'london-parliament',
    name: 'London — Westminster',
    lat: 51.4995,
    lon: -0.1248,
    altitude: 1500,
    heading: 45,
    pitch: -35,
    tag: 'target',
  },
  {
    id: 'tokyo-shibuya',
    name: 'Tokyo — Shibuya Crossing',
    lat: 35.6595,
    lon: 139.7005,
    altitude: 900,
    heading: 0,
    pitch: -45,
    tag: 'target',
  },
  // ← add yours here
];
