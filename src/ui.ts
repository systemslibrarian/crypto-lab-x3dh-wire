import { buildDemoState, bytesToHex, X3DH_INFO_STRING } from "./x3dh";

type DemoData = Awaited<ReturnType<typeof buildDemoState>>;

function shortenHex(hex: string): string {
  if (hex.length <= 72) {
    return hex;
  }
  return `${hex.slice(0, 36)}...${hex.slice(-36)}`;
}

function panelTitle(index: number): string {
  return `Panel ${index + 1}`;
}

const PANEL_LABELS = [
  "Key Registry",
  "Alice Initiates",
  "Four DH Operations",
  "KDF + Shared Secret",
  "Handoff to Double Ratchet"
];

function renderPrimitiveChips(): string {
  return `
    <ul class="primitive-chips" aria-label="Cryptographic primitives used">
      <li>X25519</li>
      <li>HKDF-SHA-256</li>
      <li>Ed25519</li>
    </ul>
  `;
}

function renderPanel1(data: DemoData): string {
  return `
    <section class="panel-card">
      <h2>${panelTitle(0)}: Key Registry (Bob's prekey bundle)</h2>
      ${renderPrimitiveChips()}
      <p>
        Bob can publish a prekey bundle while offline. Alice can fetch this bundle and begin a secure session asynchronously.
      </p>
      <div class="kv-grid">
        <div><strong>IK_B public (X25519)</strong><code>${bytesToHex(data.bob.bundle.ikBPub)}</code></div>
        <div><strong>SPK_B public (X25519)</strong><code>${bytesToHex(data.bob.bundle.spkBPub)}</code></div>
        <div><strong>OPK_B public (X25519)</strong><code>${bytesToHex(data.bob.bundle.opkBPub)}</code></div>
        <div><strong>SPK signature (Ed25519)</strong><code>${bytesToHex(data.bob.bundle.spkSignature)}</code></div>
        <div><strong>Signing public key</strong><code>${bytesToHex(data.bob.bundle.signingPub)}</code></div>
        <div><strong>Signature verification</strong><code>${data.signatureOk ? "valid" : "invalid"}</code></div>
      </div>
      <p class="small-note">Signature shown with Ed25519 as an in-spec equivalent to XEdDSA-style SPK authentication in X3DH deployments.</p>
    </section>
  `;
}

function renderPanel2(data: DemoData): string {
  return `
    <section class="panel-card">
      <h2>${panelTitle(1)}: Alice Initiates</h2>
      ${renderPrimitiveChips()}
      <p>Alice generates an identity key IK_A and ephemeral key EK_A, then fetches Bob's prekey bundle.</p>
      <div class="kv-grid">
        <div><strong>IK_A public</strong><code>${bytesToHex(data.alice.ikA.publicKey)}</code></div>
        <div><strong>EK_A public</strong><code>${bytesToHex(data.alice.ekA.publicKey)}</code></div>
        <div><strong>Fetched IK_B public</strong><code>${bytesToHex(data.bob.bundle.ikBPub)}</code></div>
        <div><strong>Fetched SPK_B public</strong><code>${bytesToHex(data.bob.bundle.spkBPub)}</code></div>
        <div><strong>Fetched OPK_B public</strong><code>${bytesToHex(data.bob.bundle.opkBPub)}</code></div>
        <div><strong>Fetched OPK id</strong><code>${data.bob.bundle.opkId}</code></div>
      </div>
    </section>
  `;
}

function renderPanel3(data: DemoData): string {
  const dh1 = bytesToHex(data.aliceDh.dh1);
  const dh2 = bytesToHex(data.aliceDh.dh2);
  const dh3 = bytesToHex(data.aliceDh.dh3);
  const dh4 = bytesToHex(data.aliceDh.dh4);

  return `
    <section class="panel-card">
      <h2>${panelTitle(2)}: Four DH Operations</h2>
      ${renderPrimitiveChips()}
      <p>The core X3DH agreement combines four X25519 computations:</p>
      <div class="dh-list">
        <article>
          <h3>DH1 = DH(IK_A, SPK_B)</h3>
          <p>Mutual authentication via Bob's signed prekey.</p>
          <code>${dh1}</code>
        </article>
        <article>
          <h3>DH2 = DH(EK_A, IK_B)</h3>
          <p>Binds Alice's ephemeral key to Bob's long-term identity.</p>
          <code>${dh2}</code>
        </article>
        <article>
          <h3>DH3 = DH(EK_A, SPK_B)</h3>
          <p>Fresh ephemeral contribution toward forward secrecy.</p>
          <code>${dh3}</code>
        </article>
        <article>
          <h3>DH4 = DH(EK_A, OPK_B)</h3>
          <p>One-time prekey component adding one-time forward secrecy.</p>
          <code>${dh4}</code>
        </article>
      </div>
    </section>
  `;
}

function renderPanel4(data: DemoData): string {
  return `
    <section class="panel-card">
      <h2>${panelTitle(3)}: KDF + Shared Secret</h2>
      ${renderPrimitiveChips()}
      <p>
        X3DH derives KM = F || DH1 || DH2 || DH3 || DH4 (where F is 32 bytes of 0xFF for X25519), then runs HKDF-SHA-256.
      </p>
      <div class="kv-grid">
        <div><strong>HKDF info string</strong><code>${X3DH_INFO_STRING}</code></div>
        <div><strong>Alice SK</strong><code>${bytesToHex(data.aliceSk)}</code></div>
        <div><strong>Bob SK</strong><code>${bytesToHex(data.bobSk)}</code></div>
        <div><strong>SK match?</strong><code>${data.matchingSecrets ? "yes" : "no"}</code></div>
      </div>
      <p class="small-note">
        Signal X3DH specification: <a href="https://signal.org/docs/specifications/x3dh/" target="_blank" rel="noreferrer">signal.org/docs/specifications/x3dh</a>
      </p>
    </section>
  `;
}

function renderPanel5(data: DemoData): string {
  return `
    <section class="panel-card">
      <h2>${panelTitle(4)}: Handoff to Double Ratchet</h2>
      ${renderPrimitiveChips()}
      <p>
        Alice's initial message carries EK_A pubkey, IK_A pubkey, selected OPK id, and ciphertext. Bob reconstructs SK and decrypts.
      </p>
      <div class="kv-grid">
        <div><strong>Header: EK_A public</strong><code>${bytesToHex(data.initialMessage.ekAPub)}</code></div>
        <div><strong>Header: IK_A public</strong><code>${bytesToHex(data.initialMessage.ikAPub)}</code></div>
        <div><strong>Header: OPK_B id</strong><code>${data.initialMessage.opkId}</code></div>
        <div><strong>AES-GCM IV</strong><code>${bytesToHex(data.initialMessage.iv)}</code></div>
        <div><strong>First encrypted message</strong><code>${shortenHex(bytesToHex(data.initialMessage.ciphertext))}</code></div>
        <div><strong>Bob decrypts</strong><code>${data.decryptedByBob}</code></div>
      </div>
      <p class="bridge-text">This SK becomes the root key for the Double Ratchet - see ratchet-wire -> <a href="https://github.com/systemslibrarian/crypto-lab-ratchet-wire" target="_blank" rel="noreferrer">crypto-lab-ratchet-wire</a>.</p>
    </section>
  `;
}

function renderStaticSections(): string {
  return `
    <section class="why-matters panel-card" aria-labelledby="why-heading">
      <h2 id="why-heading">Why this matters</h2>
      <p>Asynchronous messaging: Alice can start a secure session while Bob is offline by using Bob's prekey bundle.</p>
      <p>Offline recipients: Bob uploads signed prekeys and one-time prekeys ahead of time, enabling first-contact encryption.</p>
      <p>Forward secrecy from first message: ephemeral keys and consumed OPKs reduce damage from future key compromise.</p>
    </section>

    <nav class="links-row" aria-label="Related demos and resources">
      <a class="badge" href="https://github.com/systemslibrarian/crypto-lab-ratchet-wire" target="_blank" rel="noreferrer">Related: crypto-lab-ratchet-wire</a>
      <a class="badge" href="https://github.com/systemslibrarian/crypto-compare" target="_blank" rel="noreferrer">Category: crypto-compare Key Agreement</a>
      <a class="badge" href="https://github.com/systemslibrarian/crypto-lab" target="_blank" rel="noreferrer">crypto-lab landing page</a>
      <a class="badge" href="https://github.com/systemslibrarian/crypto-lab-x3dh-wire" target="_blank" rel="noreferrer">GitHub: crypto-lab-x3dh-wire</a>
    </nav>
  `;
}

function renderAppShell(demo: DemoData, panelIndex: number): string {
  const panels = [
    renderPanel1(demo),
    renderPanel2(demo),
    renderPanel3(demo),
    renderPanel4(demo),
    renderPanel5(demo)
  ];

  return `
    <main id="main-content" class="app-shell" aria-label="X3DH Protocol Demo">
      <header class="hero">
        <div class="hero-topline">
          <span class="category-chip" role="note">Key Agreement</span>
        </div>
        <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Switch to light mode">🌙</button>
        <h1>X3DH Wire</h1>
        <p class="subtitle">Interactive walkthrough of the Extended Triple Diffie-Hellman handshake that boots secure messaging sessions.</p>
      </header>

      <nav class="stepper" aria-label="Protocol step selector">
        ${panels
          .map((_, idx) => {
            const current = idx === panelIndex;
            return `<button class="step-btn ${current ? "active" : ""}" data-step="${idx}" aria-label="Panel ${idx + 1}: ${PANEL_LABELS[idx]}" aria-current="${current ? "step" : "false"}">Panel ${idx + 1}</button>`;
          })
          .join("")}
      </nav>

      <section id="panel-host" aria-live="polite" aria-atomic="true" role="region" aria-label="Step ${panelIndex + 1} of ${panels.length}: ${PANEL_LABELS[panelIndex]}">${panels[panelIndex]}</section>

      <div class="walkthrough-controls" role="group" aria-label="Panel navigation">
        <button id="prev-panel" type="button" aria-label="Previous panel" ${panelIndex === 0 ? "disabled" : ""}>Previous</button>
        <button id="next-panel" type="button" aria-label="Next panel" ${panelIndex === panels.length - 1 ? "disabled" : ""}>Next</button>
      </div>

      ${renderStaticSections()}
    </main>
  `;
}

function updateThemeToggleUi(theme: "dark" | "light") {
  const button = document.querySelector<HTMLButtonElement>("#theme-toggle");
  if (!button) {
    return;
  }

  if (theme === "dark") {
    button.textContent = "🌙";
    button.setAttribute("aria-label", "Switch to light mode");
    return;
  }

  button.textContent = "☀️";
  button.setAttribute("aria-label", "Switch to dark mode");
}

function applyTheme() {
  const root = document.documentElement;
  const stored = localStorage.getItem("theme");
  const mode: "dark" | "light" = stored === "light" ? "light" : "dark";
  root.dataset.theme = mode;
  updateThemeToggleUi(mode);
}

function wireThemeToggle() {
  const button = document.querySelector<HTMLButtonElement>("#theme-toggle");
  if (!button) {
    return;
  }

  updateThemeToggleUi(document.documentElement.dataset.theme === "light" ? "light" : "dark");

  button.addEventListener("click", () => {
    const root = document.documentElement;
    const next: "dark" | "light" = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("theme", next);
    updateThemeToggleUi(next);
  });
}

function wirePanelControls(demo: DemoData, initialIndex: number) {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    return;
  }

  let panelIndex = initialIndex;

  const rerender = () => {
    app.innerHTML = renderAppShell(demo, panelIndex);
    wireThemeToggle();
    wirePanelControls(demo, panelIndex);
  };

  const prev = document.querySelector<HTMLButtonElement>("#prev-panel");
  const next = document.querySelector<HTMLButtonElement>("#next-panel");

  prev?.addEventListener("click", () => {
    panelIndex = Math.max(0, panelIndex - 1);
    rerender();
  });

  next?.addEventListener("click", () => {
    panelIndex = Math.min(4, panelIndex + 1);
    rerender();
  });

  document.querySelectorAll<HTMLButtonElement>(".step-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      panelIndex = Number(btn.dataset.step || "0");
      rerender();
    });
  });
}

export async function renderDemo() {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("Missing #app container.");
  }

  const demo = await buildDemoState();
  applyTheme();
  app.innerHTML = renderAppShell(demo, 0);
  wireThemeToggle();
  wirePanelControls(demo, 0);
}
