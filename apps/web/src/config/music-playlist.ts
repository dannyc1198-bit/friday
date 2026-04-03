// Iron Man Soundtrack Playlist
// Add your own MP3 files to /public/music/

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  src: string;
  duration?: number; // seconds
}

export const ironManPlaylist: Track[] = [
  // Iron Man 1 Soundtrack
  {
    id: "shoot-to-thrill",
    title: "Shoot to Thrill",
    artist: "AC/DC",
    album: "Iron Man 2",
    src: "/music/shoot-to-thrill.mp3",
  },
  {
    id: "back-in-black",
    title: "Back in Black",
    artist: "AC/DC",
    album: "Iron Man 1",
    src: "/music/back-in-black.mp3",
  },
  {
    id: "iron-man",
    title: "Iron Man",
    artist: "Black Sabbath",
    album: "Iron Man 1",
    src: "/music/iron-man.mp3",
  },
  {
    id: "thunderstruck",
    title: "Thunderstruck",
    artist: "AC/DC",
    album: "Iron Man 2",
    src: "/music/thunderstruck.mp3",
  },
  {
    id: "highway-to-hell",
    title: "Highway to Hell",
    artist: "AC/DC",
    album: "Iron Man 2",
    src: "/music/highway-to-hell.mp3",
  },
  {
    id: "war-machine",
    title: "War Machine",
    artist: "AC/DC",
    album: "Iron Man 2",
    src: "/music/war-machine.mp3",
  },
  {
    id: "robot-rock",
    title: "Robot Rock",
    artist: "Daft Punk",
    album: "Iron Man 1",
    src: "/music/robot-rock.mp3",
  },
  {
    id: "driving-with-top-down",
    title: "Driving with the Top Down",
    artist: "Ramin Djawadi",
    album: "Iron Man Score",
    src: "/music/driving-with-top-down.mp3",
  },
  {
    id: "mark-i",
    title: "Mark I",
    artist: "Ramin Djawadi",
    album: "Iron Man Score",
    src: "/music/mark-i.mp3",
  },
  {
    id: "suit-up",
    title: "Suit Up",
    artist: "Ramin Djawadi",
    album: "Iron Man Score",
    src: "/music/suit-up.mp3",
  },
  // Avengers Theme
  {
    id: "avengers-theme",
    title: "The Avengers Theme",
    artist: "Alan Silvestri",
    album: "The Avengers",
    src: "/music/avengers-theme.mp3",
  },
  {
    id: "portals",
    title: "Portals",
    artist: "Alan Silvestri",
    album: "Avengers: Endgame",
    src: "/music/portals.mp3",
  },
];

// Startup tracks - energetic songs for boot sequence
export const startupTracks = [
  "shoot-to-thrill",
  "back-in-black",
  "thunderstruck",
  "iron-man",
];

// Working/focus tracks - instrumental scores
export const focusTracks = [
  "driving-with-top-down",
  "mark-i",
  "suit-up",
  "avengers-theme",
  "portals",
];

// Get random startup track
export function getRandomStartupTrack(): Track {
  const startupTrackIds = startupTracks;
  const randomId = startupTrackIds[Math.floor(Math.random() * startupTrackIds.length)];
  return ironManPlaylist.find(t => t.id === randomId) || ironManPlaylist[0];
}

// Get track by ID
export function getTrack(id: string): Track | undefined {
  return ironManPlaylist.find(t => t.id === id);
}
