# Soroban Learning App — Discussion Notes

> Mobile refinement: the board fills the viewport. Decimal placement uses a draggable gold caret on the bar. Retain the live number and compact Clear/Settings controls. Remove the target-number field, undo button, instructional captions, and footer. Move sound, shake, and help into Settings; show the logo in a dismissible first-visit welcome. Use short contact sounds without repeated sliding tones. Report motion permission blocks and missing sensor data with Brave-specific guidance. This refinement supersedes earlier presentation decisions below.

> Current scope (September 19, 2026): mobile-first free play, client-only PWA, published publicly as Remco28/abacus on GitHub Pages at abacus.teamremco.org. Real rod-constrained bead physics, simultaneous touch, counted-bead highlights, traditional dots every third rod, adjustable ones position and beginner place labels. Sound defaults on; three-shake reset is core. Optional manually entered practice number, no challenge mode or exercise generator (superseded September 23, 2026 by practice mode: a generated addition, subtraction or multiplication problem, read in a dialog and answered on the board, with tiers following the classical soroban order). Difficulty is two ladders rather than one scale (September 23, 2026): adding and taking away is graded by the bead movement a step needs — direct, small friends, big friends, double combination, then rows — over eleven rungs, and multiplying by operand width over six, from 1 × 1 to 3 × 3. In the problem dialog the answer rule is drawn only when the answer is, because a line with nothing written under it reads as a fault. Whether a learner can mark their place in a long column is still open. Desktop tutorials are deferred. Earlier proposals below are brainstorming history; this paragraph and README.md supersede conflicting MVP suggestions.

## Product idea

Build a touch-first soroban learning app for beginners. The learner should be able to see a target number, manipulate a visual soroban to make that number, and receive clear feedback about place values and bead movement.

The app should work well on phones in portrait or landscape, on desktop browsers, and on desktop devices with touch input. The visual beads should be intentionally flat and screen-oriented rather than trying to imitate a physical 3D abacus.

## Core learning experience

The main activity is:

1. The app shows a target number above or beside the soroban.
2. The learner moves beads to represent that number.
3. The app shows the current number represented by the board.
4. The app gives immediate feedback when the value is correct, incorrect, or incomplete.
5. The learner can reset, reveal a hint, or move to another exercise.

The target digits should remain visible while the learner works. This makes the app an exercise and teaching tool rather than only a free-play calculator.

## Board model

Each active column represents one place value. The initial column set could be:

- ones
- tens
- hundreds
- thousands

Each column has five beads:

- one upper bead worth five
- four lower beads worth one each

The upper and lower beads should have distinct shapes, colors, or labels so a beginner can understand their different values. Each column should also make its place value visible, especially while the user is learning.

The board should be data-driven rather than drawn as a collection of unrelated visual elements. A column can be represented by a value from 0 through 9, with the UI deriving bead positions from that value. This keeps touch interaction, exercises, audio, and accessibility synchronized.

## Decimal markers

The learner should be able to move the decimal marker to choose where fractional places begin. The marker is adjustable and should visibly separate whole-number places from decimal places.

Suggested behavior:

- Show a decimal marker between columns.
- Allow dragging it horizontally or tapping a column boundary to move it.
- Label columns with place values such as thousands, hundreds, tens, ones, tenths, and hundredths.
- Update the displayed current number as the marker moves.
- Include a setting for how many columns are available on each side of the marker.

For an initial version, use a fixed number of columns and make the marker move between them. Add dynamic column creation later if exercises need it.

## Interaction design

The board should be touch-friendly:

- Make each interactive region substantially larger than the visible bead.
- Let a user tap a bead area or the open track area to move the appropriate beads.
- Support dragging a bead group when that is easier than tapping.
- Keep the board usable when the phone is rotated.
- Avoid requiring precise drag-and-drop behavior for basic exercises.
- Provide reset and undo controls that are easy to reach with a thumb.

Multi-touch is a good fit for this app. Each bead or bead group should use its own pointer identity so several columns can be manipulated at once. On phones and touch-enabled desktops, browser Pointer Events provide `pointerId`, touch, pen, and mouse input through one API. The app should capture each active pointer on the board and update only the column associated with that pointer.

Desktop multi-touch will work when the computer and browser expose multiple touch contacts. A normal mouse has only one pointer, so desktop users without a touch display will still be supported with mouse and keyboard interactions but will not gain true multi-touch from software alone.

Keyboard support should include:

- selecting a column
- increasing or decreasing its value
- moving the decimal marker
- reset and undo
- submitting an answer

This also makes the tutorial usable without a touch device.

## Feedback and sound

Sound should reinforce physical movement without becoming distracting.

Possible sounds:

- a soft click or short wooden tap when a bead moves
- a different tone for activating the upper five bead
- a gentle success sound when the target is reached
- an optional error or hint sound

Include a sound toggle and a volume control. Audio should start only after a user gesture because mobile browsers restrict autoplay. Web Audio API is sufficient for generated clicks and tones; recorded samples can be added later if they sound better.

Visual feedback should do most of the teaching: highlight the changed bead, briefly highlight the affected place value, and show the arithmetic contribution of the selected column when the learner requests a hint.

## Tutorial

The tutorial should be a guided sequence rather than a long document. It can teach one idea at a time:

1. What a column represents.
2. How the lower beads count from one to four.
3. How the upper bead represents five.
4. How to combine the upper and lower beads to make six through nine.
5. How columns combine into tens, hundreds, and larger numbers.
6. How to use the decimal marker for tenths and hundredths.
7. How to solve target-number exercises.
8. How hints, reset, and undo work.

Each lesson should include a short explanation, an animated example, and a small task for the learner. The learner should be able to replay a lesson and skip ahead after demonstrating understanding.

The tutorial is primarily desktop-oriented, so it can use a wider layout with explanatory text beside the board. It should still collapse into a single-column mobile layout.

## Recommended first technology stack

Use a browser-based Progressive Web App:

- TypeScript for the application and board model.
- Vite for a small, fast development setup.
- HTML and CSS for layout, responsive behavior, controls, and tutorial content.
- SVG for the board and beads, because each bead remains an individually addressable interactive element and scales cleanly across phone and desktop sizes.
- Pointer Events for mouse, pen, single-touch, and multi-touch input.
- Web Audio API for generated interaction sounds.
- Local storage for preferences and tutorial progress.
- A small test suite for number conversion, decimal-marker behavior, and pointer-to-column interaction.

SVG is a better first rendering surface than a 3D engine for this concept. It supports the flat visual language, makes accessible labels possible, and avoids bringing in a physics or rendering system before the learning interaction is proven. Canvas is also viable, but it requires more manual hit testing and accessibility work.

The app can support landscape mode with responsive CSS. It does not need to be a separate native application to do this. Use CSS media queries and container sizing so the board changes orientation and scale when the viewport becomes wide. A PWA can be installed on a phone and used offline after the first load. Screen-orientation locking should be optional; the layout should remain usable in either orientation.

## Proposed visual direction

Use a clean, instructional board:

- high-contrast background and board rails
- flat rounded beads with clear spacing
- one color family for lower beads and another for upper beads
- a strong active-zone indicator showing where beads rest when counted
- place-value labels above or below each column
- a clearly visible decimal marker
- target number in a large, persistent display
- current represented number directly below it

Do not rely on color alone to distinguish bead types. Use shape, position, labels in the tutorial, or a pattern as a second cue.

The board should reserve enough space around each column for a finger. Visual compactness matters less than reliable manipulation on a phone.

## First build direction

The first build should be a mobile-first playable app. A desktop tutorial is deferred until the board interaction and exercise loop have been tested on a phone.

The first release should be client-side only. The browser can store the board, preferences, exercise progress, sound setting, and shake setting in local storage or IndexedDB. The app still needs to be served from HTTPS for a normal production deployment, especially for motion permissions and PWA installation, but it does not need an application server, database, login system, or API.

A static host or CDN is enough to deliver the app. A server becomes useful later only if the product adds accounts, cloud synchronization, shared lesson content, analytics, remote exercise updates, leaderboards, or a server-backed subscription.

Shake to reset is a core mobile feature. It should be enabled through an explicit setting or first-use control so the app can request motion permission from a user gesture. The detector should recognize three distinct shake peaks within a short time window, include a cooldown, and provide a visible reset confirmation. Reset, undo, and an accessible non-motion control remain available if motion permission is unavailable or the user disables the feature.

## Decisions needed before implementation

The following choices affect the first build. The recommended defaults keep the project small while leaving room to expand:

| Decision | Recommended first-build choice |
| --- | --- |
| Primary device | Phone browser or installed PWA, portrait and landscape |
| Rendering | Responsive SVG board with flat, screen-oriented beads |
| Column count | Four integer columns plus two decimal columns |
| Board interaction | Tap to set a column value, with drag support added in the same pass if it remains clear |
| Multi-touch | Independent pointer tracking per column using Pointer Events |
| Decimal marker | One draggable or tappable boundary between columns |
| Exercise mode | Target number always visible; current number visible during learning mode |
| First exercise set | Single digits, then simple two-digit numbers |
| Reset gesture | Three shake peaks within roughly two seconds, with threshold calibration and cooldown |
| Motion fallback | Reset button, undo, and keyboard support |
| Persistence | Local storage for settings and progress; no accounts |
| Audio | Generated Web Audio clicks and success tones, muted by default until enabled |
| Desktop tutorial | Deferred until the mobile board has been tested |

The main product decisions still worth making during the first prototype are whether dragging should move individual beads or set a whole column value, whether the current number should remain visible in challenge mode, and whether the initial board should use traditional soroban positioning with a counting bar. None of these require a server or a different technology stack.

## MVP scope

The first usable version should include:

- four integer columns and two decimal columns
- one upper bead and four lower beads per column
- target-number exercises
- current-value calculation
- adjustable decimal marker
- tap, drag, mouse, and keyboard controls
- multi-touch through Pointer Events
- sound effects with a mute switch
- shake-to-reset as a first-class mobile interaction
- reset, undo, hint, and answer feedback
- responsive phone portrait, phone landscape, and desktop layouts
- local persistence for settings and exercise progress

Defer these until the core interaction feels good:

- realistic 3D bead physics
- accounts and cloud synchronization
- competitive scoring or leaderboards
- dynamically infinite columns
- advanced arithmetic lessons
- custom recorded sound packs
- desktop tutorial mode

## Exercise progression

Exercises should increase difficulty gradually:

1. Make a single digit from 0 to 9.
2. Make two-digit whole numbers.
3. Make numbers that require crossing five.
4. Make numbers with zeros in the middle.
5. Read and create numbers with decimals.
6. Switch between a number display and a place-value hint.

Difficulty should be based on the concepts involved, not only on the size of the number. For example, 50 is useful because it teaches an empty ones column, while 9 teaches the combination of the upper and lower beads.

## Open decisions for the next design pass

- Should the learner manipulate beads individually, move all counted beads in a column as a group, or support both modes?
- Should the active counting edge be on the center line, as in a traditional soroban, or use another screen-friendly arrangement?
- Should exercises show the numeric target only, or also speak it aloud?
- Should the current number always be visible, or become optional in a challenge mode?
- Should hints show bead values, place-value names, or the next recommended move?
- How many columns should appear by default on a small phone in landscape?
- Should tutorial progress unlock exercise sets, or should all exercises be available immediately?

## Suggested first milestone

Build one responsive mobile screen with four integer columns, five beads per column including the upper bead, a target number, current-value display, reset, undo, sound, and pointer-based manipulation. Add the motion-permission flow and three-shake reset in this milestone. Test it on at least one iPhone and one Android phone, then verify that the fallback controls work on a mouse desktop and a touch-enabled desktop. This will answer the most important early question: whether the flat interaction feels clear and satisfying on a phone.
