# High-End 3D / Awwwards-Tier Web Stack — Sourced & License-Verified

**Verification date:** 2026-07-30
**Method:** All star counts and SPDX license IDs pulled live from the GitHub REST API (`api.github.com/repos/...`) and npm registry (`registry.npmjs.org`). License *text* was read directly where the SPDX tag was ambiguous (`NOASSERTION`). Where I could not verify, it says so explicitly.

**Critical legal framing for an agency:** Two license categories are dangerous for reselling client work:
1. **No LICENSE file at all** = "all rights reserved" by default under the Berne Convention. GitHub's own ToS grants you the right to *view and fork* on-platform, but **not** to use commercially. Most "Awwwards clone" tutorial repos fall here. Use them as *reference only*.
2. **Copyleft (GPL/AGPL)** — would force disclosure of your client's source. None of the recommended core stack is GPL. Good news.

---

## Executive Summary — The Safe Core Stack

Everything in this table is **MIT or equivalent, permissive, and safe to build and resell client sites on**. This is the foundation to standardize on.

| Library | Stars | License | Role |
|---|---:|---|---|
| [three.js](https://github.com/mrdoob/three.js) | 114,102 | **MIT** | 3D engine |
| [react-three-fiber](https://github.com/pmndrs/react-three-fiber) | 31,576 | **MIT** | React renderer for three.js |
| [@react-three/drei](https://github.com/pmndrs/drei) | 9,774 | **MIT** | 3D helpers/abstractions |
| [GSAP](https://github.com/greensock/GSAP) | 27,207 | **Custom "no charge" (Webflow)** — free for commercial, see §C1 | Animation + ScrollTrigger |
| [Lenis](https://github.com/darkroomengineering/lenis) | 15,124 | **MIT** | Smooth scroll |
| [Motion (ex-Framer Motion)](https://github.com/motiondivision/motion) | 33,017 | **MIT** | React animation |
| [Next.js](https://github.com/vercel/next.js) | 141,185 | **MIT** | Framework |
| [Magic UI](https://github.com/magicuidesign/magicui) | 21,741 | **MIT** | Copy-paste effects |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | 120,116 | **MIT** | Base components |

---

## A) Full Site Templates / Starters

### ⚠️ The most important finding in this section
I searched GitHub for the popular "Awwwards-style" template repos. **The overwhelming majority have NO LICENSE FILE**, which legally means all rights reserved. These are the repos that show up first when you search — and they are the ones you must *not* copy wholesale into paid client work.

Verified as **NO LICENSE FILE** (confirmed via `/license` API returning 404 — reference/learning only, do not ship):
- `https://github.com/adrianhajdin/award-winning-website` — 1,039 stars, **no license**. (The famous "Zentry clone" course repo. Confirmed 404 on license endpoint.)
- `https://github.com/Fullstack-Empire/GSAP-Awwwards-Website` — 272 stars, **no license**
- `https://github.com/poojahooda22/motion-website` — 185 stars, **no license**
- `https://github.com/wrongakram/ar-episode1` — 169 stars, **no license**
- `https://github.com/prashantkoirala465/web-development-portfolio` — 151 stars, **no license**
- `https://github.com/Thakuma07/Truus.co-Awwward-Website` — 138 stars, **no license**
- `https://github.com/mohitvirli/mohitvirli.github.io` — 360 stars, **no license**

These are also *clones of other studios' copyrighted designs* (Zentry, Truus, Capsule/Moyra). Even with an MIT license on the code, cloning a studio's visual design for a paying client is a trade-dress/copyright exposure. **Use them to learn the technique, then build original visuals.**

### ✅ Safe, licensed starters

**1. pmndrs/react-three-next**
- URL: `https://github.com/pmndrs/react-three-next`
- Stars: **2,861**
- License: **MIT** ✅
- What it does: The official pmndrs (the react-three-fiber maintainers) Next.js + R3F starter. Handles the genuinely hard part: correctly wiring a persistent WebGL canvas into Next.js App Router with proper SSR handling, view-tracking (multiple 3D "views" positioned by DOM elements), and performance defaults.
- **Commercial use: YES.** MIT. This is the single best licensed foundation for a Next.js 3D site.

**2. brunosimon/folio-2019**
- URL: `https://github.com/brunosimon/folio-2019`
- Stars: **4,721**
- License: **MIT** ✅
- What it does: Bruno Simon's own award-winning portfolio source (the creator of Three.js Journey). Real production-grade Three.js architecture from a top practitioner.
- **Commercial use: Code YES (MIT).** But the 3D car/assets and design are his personal brand — take the architecture patterns, not the look.

**3. ykob/sketch-threejs**
- URL: `https://github.com/ykob/sketch-threejs`
- Stars: **2,541**
- License: **MIT** ✅
- What it does: Large collection of polished, interactive Three.js sketches/effects (particles, fluid, distortion).
- **Commercial use: YES.** MIT. Excellent mine for individual hero effects.

**4. rodrigogama/awwwards-rebuilt-furrow**
- URL: `https://github.com/rodrigogama/awwwards-rebuilt-furrow`
- Stars: **163**
- License: **MIT** ✅ (code)
- What it does: Next.js + framer-motion + styled-components rebuild of an Awwwards site. Good page-transition reference.
- **Commercial use: Code is MIT, but it is a rebuild of the "Furrow" agency site — the design is not theirs to license.** Technique reference only.

**5. sanidhyay/threejs-portfolio**
- URL: `https://github.com/sanidhyy/threejs-portfolio`
- Stars: **24**
- License: **MIT** ✅
- Low stars, but genuinely MIT-licensed R3F portfolio. Safe.

---

## B) 3D Engine & Wrappers — all MIT, all safe

| Repo | Stars | License | What it does |
|---|---:|---|---|
| `https://github.com/mrdoob/three.js` | 114,102 | **MIT** | The WebGL engine. npm `three` v0.185.1, MIT. |
| `https://github.com/pmndrs/react-three-fiber` | 31,576 | **MIT** | React renderer for three.js. npm `@react-three/fiber` v9.6.1. Declarative 3D as JSX. |
| `https://github.com/pmndrs/drei` | 9,774 | **MIT** | 100+ helpers: `<Environment>`, `<OrbitControls>`, `<ScrollControls>`, `<MeshTransmissionMaterial>` (glass), `<Text3D>`. **`<ScrollControls>` + `<Scroll>` is a key primitive for scroll-driven 3D.** npm v10.7.7. |
| `https://github.com/pmndrs/react-postprocessing` | 1,333 | **MIT** | Bloom, DOF, chromatic aberration, vignette. **This is what makes 3D look "cinematic" vs "amateur"** — the single highest-leverage quality upgrade. |
| `https://github.com/pmndrs/gltfjsx` | 5,827 | **MIT** | CLI that converts a `.glb/.gltf` 3D model into a clean, tree-shakeable JSX component. Essential production tool. |
| `https://github.com/pmndrs/three-stdlib` | 854 | **MIT** | Maintained, transpiled version of three's `examples/jsm` addons. |
| `https://github.com/pmndrs/leva` | 6,172 | **MIT** | GUI panel for live-tweaking values. Dev-time tool — speeds up "dialing in the look" enormously. |
| `https://github.com/pmndrs/react-spring` | 29,127 | **MIT** | Spring physics animation, works inside R3F. |
| `https://github.com/pmndrs/uikit` | 3,231 | **MIT** (SPDX reads `NOASSERTION`; I read the LICENSE file — it is verbatim MIT, © 2024 Bela Bohlender) | Real flexbox UI *inside* the 3D canvas. |
| `https://github.com/pmndrs/react-three-offscreen` | 527 | **MIT** | Moves the 3D render to a Web Worker — keeps scroll/UI smooth on weak client devices. Relevant for trucking-company visitors on mid-range phones. |
| `https://github.com/theatre-js/theatre` | 12,563 | **Apache-2.0** ✅ | Visual keyframe/motion-design editor for the web, with a real R3F extension. Apache-2.0 is permissive and commercially safe (has an explicit patent grant). Best tool for choreographing cinematic camera moves without hand-coding keyframes. |

### Three.js Journey — important licensing note
`threejs-journey.com` (Bruno Simon) is the best-regarded course for this work. **It is a paid, proprietary course (~€95). The course lesson code is licensed to you for learning; it is not open source and there is no public repo of the lesson materials.** You can absolutely apply the *knowledge* to client work — that is the point of the course — but do not redistribute the course files. His *personal portfolio* repos (like `folio-2019` above) are separately MIT.

---

## C) Animation

### C1. GSAP — VERIFIED, and this is the headline

**Your premise is correct. I verified it from primary sources.**

- Repo: `https://github.com/greensock/GSAP` — **27,207 stars**
- License: **NOT MIT.** It is a custom **"Standard 'No Charge' GSAP License"**, now owned by **Webflow** (Webflow acquired GreenSock in 2024).
- Verified location: `https://gsap.com/community/standard-license/` — page states **"Effective date: April 30, 2025 / Last modified date: May 30, 2025 / Copyright (©) 2025, Webflow"**
- npm `gsap` v3.15.0 `license` field literally reads: `Standard 'no charge' license: https://gsap.com/standard-license.`

**Exact terms, quoted from the license page:**

> **Grant:** "Subject to the terms and conditions of this GSAP License, Webflow grants you a non-exclusive, worldwide license to use, reproduce, display, and implement GSAP Products solely for Permitted Uses."

> **"Permitted Uses" means** "the implementation and/or use of GSAP Products on any website, web application, or digital interface by any person or entity (which may include, for clarity, those of companies that compete with Webflow in other areas of business)."

> **FAQ, verbatim:** "**Can I really use GSAP in commercial projects without paying anything?** Yes, really! Commercial usage is covered under the standard license. All of GSAP including the plugins that were formerly 'members-only' like SplitText and MorphSVG can be used in commercial projects at no charge. Enjoy! 💚"

> **FAQ, verbatim:** "**Is it acceptable for AI tools like ChatGPT, Cursor, Lovable, Webstudio, etc. to generate GSAP code?** Absolutely! AI-generated code is not a 'Prohibited Use'."

**I independently confirmed the formerly-paid plugins now ship in the public npm package.** I downloaded the `gsap@3.15.0` tarball from the npm registry and listed its contents. Present, in plain unminified source:

```
package/ScrollSmoother.js      package/SplitText.js
package/MorphSVGPlugin.js      package/DrawSVGPlugin.js
package/InertiaPlugin.js       package/Physics2DPlugin.js
package/GSDevTools.js          package/Flip.js
package/ScrollTrigger.js       package/MotionPathPlugin.js
(+ matching package/src/ and package/dist/ copies)
```

**The only restriction that matters:** you may **not** use GSAP to build a **product that competes with Webflow's visual animation builder** ("Prohibited Uses" = tools letting users build animations visually without code). 

**Verdict for Wavelength Solutions: 100% SAFE and FREE.** Building animated client websites — including charging $10k for them — is squarely a "Permitted Use." You are not building a Webflow competitor. **ScrollTrigger and ScrollSmoother, the two most important plugins for the Apple effect, are free.**

⚠️ Two caveats to be aware of:
- It is **not** an OSI open-source license. It's a revocable grant, and Webflow reserves the right to change terms (§VI.B). The license does state you may keep using versions released under terms you already accepted. Practical risk: low. Worth knowing.
- There is **no LICENSE.md in the repo root** (I got a 404) — the license lives only on the website. Pin your GSAP version in `package.json` and, if you want to be thorough, archive a PDF of the license page on the date you ship each project.

### C2. Motion (formerly Framer Motion)
- URL: `https://github.com/motiondivision/motion`
- Stars: **33,017**
- License: **MIT** ✅
- Note: The old `framer/motion` repo path no longer resolves (404 via API) — the project moved to `motiondivision/motion` and rebranded to "Motion." Both npm packages exist and are MIT: `framer-motion@12.43.0` (MIT) and `motion@12.43.0` (MIT). **Use `motion` for new work.**
- What it does: React-first declarative animation, layout animations, `useScroll`/`useTransform` scroll-linked values, `whileInView` reveals.
- **Commercial use: YES.** MIT.
- *Note: Motion has a paid "Motion+" tier, but the core library is genuinely MIT — verified from the npm license field and repo SPDX tag.*

### C3. Lenis (smooth scroll) — the modern choice
- URL: `https://github.com/darkroomengineering/lenis`
- Stars: **15,124**
- License: **MIT** ✅
- npm `lenis@1.3.25`, MIT. Last pushed 2026-07-23 — **actively maintained.**
- Note: formerly `studio-freight/lenis` (that path now 404s; darkroom.engineering is the same team renamed). Update any old bookmarks.
- What it does: Buttery inertial smooth scroll that (critically) doesn't hijack accessibility or break `position: sticky`. Includes an official React binding (`lenis/react`) and a documented GSAP ScrollTrigger integration.
- **Commercial use: YES.** MIT. **This is the recommended smooth-scroll layer.**

### C4. Locomotive Scroll — legacy, prefer Lenis
- URL: `https://github.com/locomotivemtl/locomotive-scroll`
- Stars: **8,835**
- License: **MIT** ✅ (last push 2026-06-30)
- What it does: The older smooth-scroll + parallax/in-view detection library. v4/v5 rewrote to lean on Lenis internally.
- **Commercial use: YES.** MIT. But **for new builds use Lenis directly** — better React support, better GSAP interop, more momentum.

### C5. GSAP ScrollSmoother vs Lenis
Now that ScrollSmoother is free (verified above), it's a legitimate alternative and integrates perfectly with ScrollTrigger by design. **Practical guidance: if you're already all-in on GSAP, use ScrollSmoother. If you're in React/Next with Motion components, use Lenis.** Do not run both — they fight over scroll.

---

## D) Copy-Paste Effect Libraries — license nuances matter a lot here

**1. Magic UI — ✅ BEST LICENSE IN THIS CATEGORY**
- URL: `https://github.com/magicuidesign/magicui`
- Stars: **21,741**
- License: **MIT** (verified: LICENSE.md, SPDX `MIT`)
- What it does: 150+ animated React/Tailwind/Motion components — marquees, animated beams, shimmer buttons, blur-fade text reveals, globes, particle backgrounds, retro grids. Copy-paste (shadcn-style), not an npm dependency.
- **Commercial use: YES, unambiguously.** MIT with no added clauses. Free components. There is a paid "Magic UI Pro" template pack, but the component library itself is MIT.
- **Recommendation: make this your default effect library.**

**2. React Bits — ⚠️ MIT + COMMONS CLAUSE — read this carefully**
- URL: `https://github.com/DavidHDev/react-bits`
- Stars: **44,485** (highest-starred in this category)
- License: **MIT + Commons Clause License Condition v1.0** (GitHub reports `NOASSERTION`; I read LICENSE.md in full)
- Exact restriction, quoted: *"You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves—whether alone, in a bundle, or as a ported version.**"* Grant text explicitly permits distribution *"as part of an application, website, or product."*
- What it does: Large collection of high-impact animated React components, including genuine WebGL/shader pieces — this is the closest thing to "Awwwards effects as npm-able components." Aurora backgrounds, liquid/metallic distortion, particle text, image trails.
- **Commercial use: YES for building client websites — this is explicitly permitted.** ✅
- **PROHIBITED:** repackaging the components into a template/theme/component-kit you sell. So: shipping a client site that *uses* React Bits = fine. Selling a "Wavelength Site Template" whose value *is* the React Bits components = not fine.
- Practical note: since your pipeline generates many sites from a shared internal codebase, keep it clearly framed as "we build websites for clients" (a service), not "we license a template product." The former is squarely permitted.

**3. Aceternity UI — free tier MIT-ish, but the good stuff is paid; NO public monorepo**
- Repo: **Could not verify a canonical public repo.** `github.com/aceternity/ui` returns 404 via the API. The library is distributed through the website (`ui.aceternity.com`), not a public GitHub monorepo. **I will not invent a star count.**
- Pricing (verified live from `https://ui.aceternity.com/pricing` on 2026-07-30):
  - **Free:** "Access to all free components", copy-paste, built with Next.js/React/Tailwind/Framer Motion.
  - **Annual Access: $169/yr** (from $249) — 200+ premium Blocks, 12+ Templates.
  - **Lifetime Access: $199 one-time** (from $299) — most popular; 200+ premium Blocks, 12+ Templates, lifetime updates.
  - **Team: $1,590 one-time** (from $1,990) — 10 team members.
- What it does: The free components (Spotlight, 3D Card, Background Beams, Hero Parallax, Wavy Background) are widely used and genuinely high-impact. Premium tier adds full page Blocks and complete Templates.
- **Commercial use:** Free components — yes, they're published as copy-paste snippets intended for use in your projects. **However: I could not locate a formal LICENSE document** (`/license` on the site 404s). ⚠️ **For an agency, the absence of a written license on free components is a real gap.** Recommendation: **if you want Aceternity in the pipeline, buy the $199 Lifetime tier** — it's trivially cheap against a single $10k build, and a paid commercial tier gives you a purchase record and defined terms. Confirm in writing with them that client-deliverable use is covered before standardizing on it.
- ⚠️ Note the **Team tier exists at $1,590** — that pricing structure implies per-seat limits. If you add contractors, check the seat terms.

**4. 21st.dev — ✅ MIT (platform), but components are community-contributed**
- URL: `https://github.com/serafimcloud/21st`
- Stars: **5,364**
- License: **MIT** (verified: LICENSE, © 2024 21st.dev)
- ⚠️ **Last pushed: 2025-05-28** — the public repo has been dormant for over a year. The *platform* is live, but the repo is not actively maintained.
- What it does: A marketplace/registry of shadcn-based React+Tailwind components, blocks, and hooks. Also the backend for the "Magic MCP" tool.
- **Commercial use:** The MIT license covers the *platform code*. **Individual components are uploaded by third-party authors and each carries its own terms.** Check per-component licensing before shipping. Treat as a discovery tool, not a blanket-licensed library.

**5. Uiverse — ✅ MIT**
- URL: `https://github.com/uiverse-io/galaxy`
- Stars: **11,741**
- License: **MIT** (verified: LICENSE, © 2023 Uiverse.io)
- What it does: Huge community library of pure CSS / Tailwind UI elements — buttons, toggles, loaders, cards. **CSS-only, no JS/3D.** Good for micro-detail polish (a beautifully weird submit button), not for hero sections.
- **Commercial use: YES.** MIT, free. The site states elements are MIT.

**6. Cursify — ⚠️ NO LICENSE FILE**
- URL: `https://github.com/ui-layouts/cursify`
- Stars: **1,983**
- License: **NONE.** Verified — the `/license` API endpoint returns 404 "Not Found." No LICENSE file in the repo.
- What it does: Custom cursor animation components for React/Next (trailing cursors, blob cursors, canvas cursor effects). The effect is a legitimate Awwwards-tier signal.
- **Commercial use: ❌ NOT CLEARLY LEGAL.** No license = all rights reserved. **Do not ship Cursify code in a paid client site.** Custom cursors are ~40 lines of code — either reimplement the technique yourself (trivial, and the *idea* isn't protectable) or ask the maintainer to add an MIT license. **Flagging this as the main license trap in your list.**

**7. shadcn/ui — ✅ MIT (the base layer)**
- URL: `https://github.com/shadcn-ui/ui`
- Stars: **120,116**
- License: **MIT**
- Not "high-end effects," but it's the substrate Magic UI / Aceternity / 21st all build on. Copy-paste (you own the code), Radix + Tailwind, accessible by default.
- **Commercial use: YES.**

**8. Spectrum UI — Apache-2.0**
- URL: `https://github.com/arihantcodes/spectrum-ui`
- Stars: **1,012**
- License: **Apache-2.0** ✅
- Reusable components built on Aceternity UI patterns — useful as an *openly-licensed* alternative to some Aceternity components.
- **Commercial use: YES.** Apache-2.0.

---

## E) WebGL Shader / Effect Collections

**1. Codrops (tympanus) — ✅ MIT, and this is a goldmine**
- Org: `https://github.com/codrops` — **345 public repos**
- License: **MIT**, confirmed from their official license page `https://tympanus.net/codrops/licensing/`:
  > "Our downloadable demos are licensed under the **MIT license**, if not specifically mentioned otherwise" (© Codrops).
  > Design freebies: "can be used in personal or commercial projects with the exception of redistribution, republishing or sale of the item itself."
- **Commercial use: YES for the code demos (MIT).** ✅ This is the highest-value, cleanest-licensed source of Awwwards-caliber effects on the internet.
- ⚠️ Per-repo caveat: MIT is the default, but **some individual repos carry no LICENSE file** — I verified a mix. Check the specific repo. Confirmed **MIT** on the API: `SlideshowAnimations` (304), `GooeyTextHoverEffect` (156), `LineTextHoverAnimations` (154), `CodropsTemplate` (139), `KineticTypePageTransition` (122), `OnScrollLayoutFormations` (112), `Staggered3DGridAnimations` (96), `OneElementScroll` (71), `IntroGridMotionTransition` (66), `3DCarousel` (56), `ContextAwareLogoAnimationScroll` (58), `ElasticGridScroll` (55), `OnScrollSVGFilterText` (54), `PushGridItems` (39), `ScrollTextMotion` (38), `RotatingOnScrollAnimations` (26), `RepeatingImageTransition` (22).
- Confirmed **no SPDX license detected** (older, high-star repos — verify before shipping): `PageTransitions` (2,311), `SidebarTransitions` (1,657), `Animocons` (1,548), `ParticleEffectsButtons` (1,263), `CodropsBranding` (11).
- **Highest-value picks for your use case:** `OnScrollLayoutFormations`, `ScrollTextMotion`, `RepeatingImageTransition`, `KineticTypePageTransition`, `ContextAwareLogoAnimationScroll`, `IntroGridMotionTransition`.

**2. ykob/sketch-threejs** — 2,541 stars, **MIT** ✅ — interactive WebGL sketch collection (already listed in §A).

**3. spite/THREE.MeshLine**
- URL: `https://github.com/spite/THREE.MeshLine`
- Stars: **2,336**
- License: **MIT** ✅
- Proper thick/textured lines in three.js (native WebGL lines can't do width). Needed for those flowing-ribbon hero effects.
- **Commercial use: YES.**

**4. Shadertoy — ⚠️ IMPORTANT WARNING**
Not a repo, but you *will* be tempted. `shadertoy.com` shaders default to **CC BY-NC-SA 3.0 — the NC means NON-COMMERCIAL.** Copying a Shadertoy shader into a paid client site is a license violation unless the author explicitly relicensed it. Many "shader gallery" collections are Shadertoy ports with this same taint. **Verify per-shader authorship, or write your own GLSL.** This is a genuine and commonly-ignored risk.

---

## F) Scroll-Driven Video / Frame-by-Frame Scrubbing (the Apple effect)

**How Apple actually does it:** Apple does **not** scrub an `<video>` element. They pre-export the animation as a **numbered JPEG/WebP image sequence** and draw the current frame to a `<canvas>` on scroll. Reason: `video.currentTime` seeking is unreliable and stuttery across browsers (especially Safari/iOS, which won't seek smoothly without heavy keyframe-only re-encoding), while canvas frame-blitting is deterministic and buttery. **This is the technique to implement.** The canonical modern write-up is the Codrops-adjacent / `web.dev` "Building the Apple AirPods scroll animation" pattern using GSAP ScrollTrigger + canvas + a preloaded image array.

**1. m5kr1pka/canvas-scroll-clip — ✅ best licensed option**
- URL: `https://github.com/m5kr1pka/canvas-scroll-clip`
- Stars: **117**
- License: **MIT** ✅
- What it does: Standalone JS micro-library for exactly this — canvas-based scroll-driven image-sequence playback ("fancy scroll and click animations"). No framework lock-in.
- **Commercial use: YES.** MIT. **Highest-star MIT option for the core technique.**

**2. ghepting/javascript-video-scrubber — ⚠️ no license**
- URL: `https://github.com/ghepting/javascript-video-scrubber`
- Stars: **98**
- License: **NONE** (no SPDX detected)
- What it does: The original, widely-referenced demo of scrubbing a JPEG sequence with native scroll position. Historically the reference implementation everyone learned from.
- **Commercial use: ❌ Not clearly licensed.** Read it to understand the technique, then write your own. The technique is ~60 lines.

**3. chrishow/scroll-scrub-video-component — ✅ MIT**
- URL: `https://github.com/chrishow/scroll-scrub-video-component`
- Stars: **3** (low, but clean license and tidy code)
- License: **MIT** ✅
- What it does: A native Web Component wrapping scroll-scrubbed video. Framework-agnostic, drop-in `<scroll-scrub-video>`.
- **Commercial use: YES.** MIT.

**4. KubeezMedia/kubeez-scroll-world-video — ⚠️ no license**
- URL: `https://github.com/KubeezMedia/kubeez-scroll-world-video`
- Stars: **597** (highest-star result for "scroll video scrub")
- License: **NONE** (no SPDX detected)
- What it does: Scroll-scrubbed "fly through the world" cinematic demo. Visually the closest to what Danny is describing.
- **Commercial use: ❌ Not clearly licensed.** Reference only.

**5. basementstudio/scrollytelling — ✅ MIT (verified by reading the file)**
- URL: `https://github.com/basementstudio/scrollytelling`
- Stars: **1,613**
- License: **MIT** — GitHub's SPDX detector says `NOASSERTION`, but I read the LICENSE file: it is verbatim MIT, "Copyright (c) 2023 basement.studio". ✅
- What it does: **React + GSAP scrollytelling library from basement.studio — an actual award-winning agency.** Declarative `<Scrollytelling.Animation>` / `<Scrollytelling.Pin>` / `<Scrollytelling.Waypoint>` components wrapping ScrollTrigger. This is production-proven at exactly the tier Danny is targeting.
- **Commercial use: YES.** MIT. **Strong recommendation** — it makes cinematic scroll choreography declarative in React instead of imperative ScrollTrigger spaghetti.

**6. muxinc/next-video — ✅ MIT**
- URL: `https://github.com/muxinc/next-video`
- Stars: **1,218**
- License: **MIT** ✅ (npm `next-video@2.8.1`, MIT; `@mux/mux-player-react@3.13.2`, MIT)
- What it does: Solves the *delivery* half. Video and image sequences are heavy (an Apple-style sequence is easily 300+ frames / 50–150MB). This handles optimization, adaptive streaming, poster generation, and lazy loading in Next.js. Netlify-compatible.
- **Commercial use: YES.** MIT (the library; Mux the *hosting service* is paid usage-based — but you can also just use local files).

**7. GSAP ScrollTrigger (+ ScrollSmoother)** — free as of 2025, verified in §C1. `ScrollTrigger` with `scrub: true` and `pin: true` is the actual engine behind virtually every Apple-style scroll sequence on the web. **Docs: `https://gsap.com/docs/v3/Plugins/ScrollTrigger/`**

**8. drei `<ScrollControls>`** — MIT (part of `@react-three/drei`, §B) — for when the scrubbed thing is a *3D scene* rather than a video.

---

## Best-Practice Stack for the Apple-Product-Page Look (2026)

Concrete, with real repos. Assumes Next.js + Netlify + Windows, per Danny's existing setup.

### Layer 1 — Framework
`Next.js` (MIT, 141,185★) App Router, static export where possible → deploys to Netlify unchanged. Keeps continuity with the existing Node/Express + Netlify pipeline.

### Layer 2 — Scroll foundation (pick ONE, never both)
- **React-centric:** `lenis` (MIT, 15,124★) via `lenis/react`, wired to GSAP ScrollTrigger with Lenis's documented `scrollerProxy` integration.
- **GSAP-centric:** GSAP `ScrollSmoother` — **now free** (verified §C1).

### Layer 3 — Scroll choreography
`GSAP` + `ScrollTrigger` (free, verified) as the engine. Wrap it in **`basementstudio/scrollytelling`** (MIT, 1,613★) so the cinematic sequences are declarative React instead of imperative refs. `pin: true` + `scrub: 1` is the core of every Apple section.

### Layer 4 — The scroll-scrubbed video hero (the money shot)
**Canvas + preloaded image sequence, not `<video>`.** Pipeline:
1. Render/export the animation → numbered `WebP` frames (WebP over JPEG: ~30% smaller at equal quality). Target **~120–240 frames** for a full-viewport section.
2. Preload into an `Image[]` array; draw `frames[i]` to `<canvas>` inside a `ScrollTrigger` `onUpdate`.
3. Reference implementation: **`m5kr1pka/canvas-scroll-clip`** (MIT, 117★) or roll your own from the technique.
4. Serve via **`muxinc/next-video`** (MIT) or Netlify's image CDN to keep payload sane.
5. **Mobile fallback:** ship a shorter sequence (or a static hero) under `prefers-reduced-motion` and below ~768px. Non-negotiable — trucking/trades clients' customers are heavily mobile, and a 100MB hero will destroy your conversion rate and your Lighthouse score.

### Layer 5 — 3D model hero
`three.js` (MIT) + `@react-three/fiber` (MIT) + `@react-three/drei` (MIT), scaffolded from **`pmndrs/react-three-next`** (MIT, 2,861★).
- Convert models with **`gltfjsx`** (MIT).
- **Compress every model with Draco or Meshopt** — an uncompressed `.glb` is often 10–40MB; compressed, 1–3MB.
- Use `drei`'s `<Environment>` with an HDRI + `<MeshTransmissionMaterial>` for the glass/metal look that reads as "expensive."
- **Add `react-postprocessing` (MIT): Bloom + subtle Depth of Field + Vignette.** This single step is the biggest visual gap between hobbyist and Apple-tier 3D.
- Choreograph camera moves in **Theatre.js** (Apache-2.0, 12,563★) rather than hand-tuning numbers.
- Offload to a worker with `react-three-offscreen` (MIT) if the scene is heavy.

### Layer 6 — Cinematic reveals / typography
- `motion` (MIT, 33,017★) for `whileInView` reveals and layout animations.
- **GSAP `SplitText` — now free** (verified present in the npm tarball) for per-character/per-line text reveals. This was the single most-paywalled GSAP plugin and it's the classic Awwwards text effect. Big unlock.
- `Magic UI` (MIT, 21,741★) for blur-fade text, animated beams, marquees.
- `React Bits` (MIT+Commons Clause — fine for client sites) for the WebGL-flavored backgrounds.
- Codrops MIT demos for bespoke transitions.

### Layer 7 — Asset discipline (what actually separates $10k from $500)
This is where most "3D website" attempts fail, and it's not a library choice:
- **Real typography** — license a quality typeface (Klim, Grilli, Displaay). Free Google Fonts are the fastest tell that a site is cheap. Budget ~$200–500/site or buy an agency-wide license.
- **Draco/Meshopt on all models; WebP/AVIF on all images.**
- Lighthouse ≥ 90 on mobile. Awwwards-tier sites that *convert* are fast; a beautiful 8-second-LCP site loses trucking leads.
- `prefers-reduced-motion` respected throughout — accessibility *and* it prevents motion sickness complaints.

### Licensing posture for the agency (bottom line)
- **Safe to build the whole business on:** three.js, R3F, drei, react-postprocessing, gltfjsx, leva, Motion, Lenis, Locomotive, Next.js, Magic UI, shadcn/ui, Uiverse, Codrops MIT demos, basementstudio/scrollytelling, canvas-scroll-clip, next-video, THREE.MeshLine, sketch-threejs, react-three-next, Spectrum UI (Apache-2.0), Theatre.js (Apache-2.0).
- **Safe but read the clause:** **GSAP** (free incl. all plugins; just don't build a Webflow-competing animation builder). **React Bits** (use in client sites ✅; don't resell the components as a template product).
- **Do NOT ship:** **Cursify** (no license — verified 404), **Shadertoy shaders** (CC BY-NC-SA — non-commercial), any of the **no-license "Awwwards clone" repos** in §A, and any **ThemeForest single-use** template (their Regular License covers one end product and explicitly forbids reuse across multiple client projects — you'd need a separate purchase per client).
- **Buy, don't risk:** **Aceternity UI Lifetime at $199** if you want their blocks/templates in the pipeline. Cheapest legal certainty you'll ever buy against a $10k invoice.
- **No GPL/AGPL anywhere in the recommended stack.** ✅

### Recommended concrete starting move
`git clone https://github.com/pmndrs/react-three-next` (MIT) → add `gsap` + `lenis` + `@basementstudio/scrollytelling` + `motion` + Magic UI components → build one reference "trucking company" site as the master template → then have the existing prospector pipeline at `C:\Users\12368\jarvis\agents\prospector\` swap in per-client copy, colors, logo, and one hero asset instead of generating single-file HTML. Everything in that chain is MIT or explicitly-permitted commercial.
