import * as THREE from 'three';

// Google Photoreal 3D Tiles are served in ECEF (Earth-Centered Earth-Fixed)
// WGS84 coordinates — meters from the Earth's center. Our whole scene lives
// in that frame, so every camera math function here converts lat/lon/alt
// into ECEF meters before touching three.js.

const WGS84_A = 6378137.0;            // equatorial radius (m)
const WGS84_F = 1 / 298.257223563;    // flattening
const WGS84_E2 = WGS84_F * (2 - WGS84_F); // first eccentricity squared

const DEG = Math.PI / 180;

export function latLonAltToEcef(
  latDeg: number,
  lonDeg: number,
  altMeters: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  // N = radius of curvature in the prime vertical — the WGS84 ellipsoid
  // isn't a perfect sphere, this corrects for the flattening at the poles.
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const x = (N + altMeters) * cosLat * Math.cos(lon);
  const y = (N + altMeters) * cosLat * Math.sin(lon);
  const z = (N * (1 - WGS84_E2) + altMeters) * sinLat;
  return out.set(x, y, z);
}

// Local East-North-Up frame at a given lat/lon. Used to build oblique
// camera offsets ("stand 1500m above the target, tilted 45° looking north").
export type EnuFrame = {
  origin: THREE.Vector3; // ECEF point on the surface below the camera
  east: THREE.Vector3;
  north: THREE.Vector3;
  up: THREE.Vector3;
};

export function enuFrameAt(latDeg: number, lonDeg: number): EnuFrame {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  const origin = latLonAltToEcef(latDeg, lonDeg, 0);

  // Standard ENU basis vectors derived from the geodetic latitude/longitude.
  const east = new THREE.Vector3(-sinLon, cosLon, 0);
  const north = new THREE.Vector3(-sinLat * cosLon, -sinLat * sinLon, cosLat);
  const up = new THREE.Vector3(cosLat * cosLon, cosLat * sinLon, sinLat);

  return { origin, east, north, up };
}

// Build a camera (position, lookAt, up) for a POI using Google-Earth-style
// heading (0=N, 90=E) and pitch (-90=straight down, 0=horizontal).
export function cameraForPoi(
  latDeg: number,
  lonDeg: number,
  altitude: number,
  headingDeg = 0,
  pitchDeg = -90,
): { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } {
  const { origin, east, north, up } = enuFrameAt(latDeg, lonDeg);

  // "Forward" is the horizontal direction the camera faces, rotated from
  // north by the heading angle (clockwise when viewed from above).
  const h = headingDeg * DEG;
  const forward = new THREE.Vector3()
    .addScaledVector(north, Math.cos(h))
    .addScaledVector(east, Math.sin(h));

  // Pitch: -90 → camera directly above, 0 → camera at horizon height.
  // The camera sits behind the target along -forward, raised by +up,
  // weighted by the pitch.
  const downAngle = -pitchDeg * DEG; // 0..90 for normal oblique views
  const offset = new THREE.Vector3()
    .addScaledVector(up, Math.sin(downAngle))
    .addScaledVector(forward, -Math.cos(downAngle))
    .multiplyScalar(altitude);

  const position = origin.clone().add(offset);
  return { position, target: origin, up };
}
