// FRIDAY voice test — greets Danny + reports Langley BC weather
// Uses Windows SAPI (System.Speech.Synthesis) — zero cost, offline
// Run from jarvis root: node scripts/voice-test.mjs

import { spawnSync } from 'node:child_process';

// --- Fetch Langley BC weather from wttr.in (no API key) ---
async function getLangleyWeather() {
  const res = await fetch('https://wttr.in/Langley,BC?format=j1');
  if (!res.ok) throw new Error(`wttr.in returned ${res.status}`);
  const data = await res.json();
  const current = data.current_condition[0];
  return {
    tempC: parseInt(current.temp_C, 10),
    feelsLikeC: parseInt(current.FeelsLikeC, 10),
    description: current.weatherDesc[0].value,
    windKph: parseInt(current.windspeedKmph, 10),
    humidity: parseInt(current.humidity, 10),
  };
}

// --- TODO: YOU WRITE THIS ---
// This function shapes HOW FRIDAY talks about the weather. It's the
// personality-defining bit — she's warm, Irish, calls Danny "boss",
// and should sound like she's briefing him, not reading a forecast.
//
// Input: { tempC, feelsLikeC, description, windKph, humidity }
// Output: a single sentence string she'll speak
//
// Trade-offs to consider:
//   - Literal ("It's 8 degrees and cloudy in Langley") = accurate but boring
//   - Personality ("Bit brisk out there boss, 8 and overcast — grab a hoodie") = on-brand but may feel scripted
//   - Contextual (mention wind only if windy, jacket only if cold) = smart but more logic
//
// Pick the style that matches how you want FRIDAY to feel day-to-day.
function phraseWeather(w) {
  // TODO: replace this placeholder with your version
  return `It is currently ${w.tempC} degrees and ${w.description.toLowerCase()} in Langley.`;
}

// --- Windows SAPI speak via PowerShell ---
// Picks the first female voice available (Zira on most Win10/11), falls back to default.
function speak(text) {
  console.log(`\n[FRIDAY says]: ${text}\n`);
  const safe = text.replace(/'/g, "''"); // escape single quotes for PS
  const ps = `
    Add-Type -AssemblyName System.Speech;
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
    $female = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1;
    if ($female) { $s.SelectVoice($female.VoiceInfo.Name) }
    $s.Rate = 0;
    $s.Volume = 100;
    $s.Speak('${safe}');
  `;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`SAPI exited ${r.status}`);
}

// --- Run ---
(async () => {
  const weather = await getLangleyWeather();
  console.log('Weather fetched:', weather);

  const greeting = 'Hello Mr. Ciampelletti, what are we needing to accomplish today?';
  const weatherLine = phraseWeather(weather);
  const fullScript = `${greeting} ${weatherLine}`;

  speak(fullScript);
  console.log('Done.');
})().catch((e) => {
  console.error('Voice test failed:', e.message);
  process.exit(1);
});
