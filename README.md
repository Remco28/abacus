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

Drag the gold caret horizontally along the counting bar to choose the ones rod and move the decimal. The slider also supports keyboard arrows; place labels remain tappable. Traditional marker dots stay fixed every third rod. The board fills the viewport, with only the number, Clear, and Settings above it. A dismissible logo welcome appears on the first visit.

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

`npm test` covers digits 0–9, contiguous counting, decimal precision, bead pushing, collision energy/constraints, and shake timing/debounce. `node tests/browser.mjs <CDP HTTP endpoint> <app URL>` checks simultaneous touch, drag/keyboard decimal control, persistence, first-visit welcome dismissal, shake reset, denied/no-data sensor guidance, and landscape layout. Synthetic motion/pointer tests do not replace physical iPhone and Android validation.

Traditional unit dots: [League of Japan Abacus Associations](https://www.shuzan.jp/english/preliminary/). Hosting: [GitHub custom-domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).
