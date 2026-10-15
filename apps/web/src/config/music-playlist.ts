// Local playlist only. Do not commit commercial recordings.
// Drop files you have rights to into apps/web/public/music/ and list them here.

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  src: string;
  duration?: number; // seconds
}

export const ironManPlaylist: Track[] = [];

export const startupTracks: string[] = [];

export const focusTracks: string[] = [];

export function getRandomStartupTrack(): Track | null {
  if (ironManPlaylist.length === 0 || startupTracks.length === 0) return null;
  const randomId = startupTracks[Math.floor(Math.random() * startupTracks.length)];
  return ironManPlaylist.find((track) => track.id === randomId) || ironManPlaylist[0] || null;
}

// Get track by ID
export function getTrack(id: string): Track | undefined {
  return ironManPlaylist.find(t => t.id === id);
}
