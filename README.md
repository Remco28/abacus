# Soroban

A mobile-first, client-only soroban with weighted bead collisions, multi-touch, sound, movable decimal placement, and shake reset.

Hosted at **https://abacus.teamremco.org** through GitHub Pages.

## Development

Requires Node.js 22.12+ (or a current Node 24 release).

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

## Play

Slide beads toward the middle bar to count them. Upper beads count as five; lower beads count as one. Dragging pushes neighboring beads; tapping moves the selected group to or away from the bar. Counted beads light up. Multiple pointer identities allow simultaneous interaction, including upper and lower beads on the same rod.

Tap the lock beside Clear to unlock the gold caret, then drag horizontally along the counting bar to move the decimal. Releasing locks it again; while locked, a sideways drag along that bar is the wipe instead, so the caret keeps the bar only while it is open and the two gestures never compete.

On a real soroban you clear the board by running a finger along the reckoning bar, and the locked bar does the same here: sweep sideways and each rod's beads leave the bar as your finger reaches them, so the wave keeps up with the hand instead of waiting for it to arrive. Sweep as far as the far edge and the board clears, with the rods you never reached finishing the wave behind you; lift early and the beads spring back to where they were, which is what stops a stray brush from wiping a number in progress. A tap, or a mostly-vertical drag, on the bar does nothing.

Place labels are read-only. Keyboard arrows work after unlocking. Traditional marker dots stay fixed every third rod. In portrait, the number, Clear, and Settings sit above the board, with the place labels above the beads. Landscape moves the controls to a slim right-hand strip and drops the place labels, spending that height on taller, easier-to-hit beads instead; the tally and the per-column digits still report what every rod holds. A buffer stays above the phone's gesture edge either way. A dismissible logo welcome appears on the first visit.

Settings also holds Test mode. Choose the operations to practise (addition, subtraction, multiplication) and a level on each ladder — adding and taking away is graded by the bead movement a step needs, multiplying by the width of its operands — then press Problem to read a problem in a dialog, work it out on the beads, and press Submit. A wrong answer offers to clear the board, keep it, or reveal the answer. Test mode puts the decimal on the last column and holds it there, so all six rods carry whole numbers and nothing it asks for can leave the abacus. It reports the verdict through the same live region a screen reader already follows. The problem you are on survives a reload, and in a column of three or more numbers, tapping the line you are on marks your place — the mark is only offered inside the dialog, and it outlives the reload too.

Sound is on by default and starts after the first user interaction. Short damped noise taps play on contacts; there is no continuous sliding tone. Sound, shake, and help live in Settings. Enable shake explicitly to request motion access. Three distinct acceleration peaks within two seconds reset the board; a cooldown prevents repeated resets. Motion shows On only after valid sensor data arrives. Denied permissions and absent readings show actionable guidance. Brave Android may require Settings → Site settings → Motion sensors; a website cannot override that browser setting. Motion availability and sensitivity need testing on actual phones. No motion data leaves the device.

## Architecture

TypeScript, Vite, SVG, and a custom one-dimensional rigid-body simulation. Beads have equal effective mass, fixed rod constraints, collision impulses, low restitution, and velocity damping. Dragging directly pushes contacting beads. A small contact tolerance helps count beads seated against the bar. This is a controllable approximation, not a full physical replica. Beads do not move with phone tilt.

The board, sound preference, and welcome dismissal persist locally. Motion permission is deliberately enabled each session. No accounts, backend, analytics, or third-party runtime requests. A service worker caches the built app for offline use. Storage can be cleared by the browser.

## Deployment

Push to `main` to run tests, build, and deploy using GitHub Actions. Pages must use **GitHub Actions** as its source. Set its custom domain to `abacus.teamremco.org`.

At the DNS provider, create:

| Type | Name | Target |
| --- | --- | --- |
| CNAME | abacus | Remco28.github.io |

After DNS validates and GitHub issues a certificate, enable **Enforce HTTPS** in repository Pages settings using an administrator account. The default Actions token cannot change that setting. HTTPS is required for motion and service workers. A static host delivers the files; no application server is needed.

## Verification

`npm test` covers digits 0–9, contiguous counting, decimal precision, bead pushing, collision energy/constraints, shake timing/debounce, and the practice-mode generator: the complement classifier, every rung of both ladders, the board's capacity, and subtraction that never passes through a negative total. `node tests/browser.mjs <CDP HTTP endpoint> <app URL>` checks simultaneous touch, drag/keyboard decimal control, the reckoning-bar wipe (following the finger, springing back on a short swipe, clearing on a full traverse, and ignoring a tap), persistence, first-visit welcome dismissal, shake reset, denied/no-data sensor guidance, and landscape layout. `node tests/browser-testmode.mjs <CDP HTTP endpoint> <app URL>` checks practice mode end to end: normalizing and holding the decimal, reading a problem in its dialog, clear/keep/reveal on a wrong answer, accepting and rejecting answers, marking your place in a column, restoring the decimal on exit, and the problem, the board and the mark surviving a reload. Synthetic motion/pointer tests do not replace physical iPhone and Android validation.

Traditional unit dots: [League of Japan Abacus Associations](https://www.shuzan.jp/english/preliminary/). Hosting: [GitHub custom-domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).
