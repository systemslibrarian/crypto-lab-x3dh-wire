import {
  buildDemoState,
  bytesToHex,
  createAliceState,
  createBobState,
  DEFAULT_SCENARIO,
  X3DH_INFO_STRING,
  type AliceState,
  type BobState,
  type Scenario
} from "./x3dh";

type DemoData = Awaited<ReturnType<typeof buildDemoState>>;

// ── Hex helpers ──────────────────────────────────────────────────────────
// A newcomer drowns in 64-char hex, so full values collapse to head…tail with
// a click-to-expand. The full string is always in the DOM (title + expand) so
// no information is lost and nothing is faked.
function shortHex(hex: string): string {
  if (hex.length <= 20) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

function hexChip(bytes: Uint8Array | null, owner: "alice" | "bob" | "pub", secret: boolean, label: string): string {
  if (!bytes) {
    return `<span class="hexchip hexchip--absent" data-owner="${owner}">— (omitted)</span>`;
  }
  const hex = bytesToHex(bytes);
  const kind = secret ? "private" : "public";
  return `<button type="button" class="hexchip hexchip--${owner} hexchip--${kind}" data-full="${hex}" data-short="${shortHex(hex)}" aria-label="${label}: ${kind} key, ${hex.length / 2} bytes. Activate to reveal full hex." title="${hex}"><span class="hexchip-dot" aria-hidden="true"></span><span class="hexchip-hex">${shortHex(hex)}</span></button>`;
}

// ── Glossary ─────────────────────────────────────────────────────────────
// First-use tooltips: a dotted term expands its one-line definition inline via
// a popover-like <button> with aria-describedby wiring for screen readers.
const GLOSSARY: Record<string, string> = {
  prekey:
    "A key Bob uploads to the server AHEAD of time so Alice can start a session while Bob is offline.",
  "signed prekey":
    "A medium-term prekey (SPK) that Bob signs with his identity key so Alice knows it is really Bob's.",
  "ephemeral key":
    "A single-use key (EK_A) Alice generates fresh for this one handshake and then throws away — the source of forward secrecy.",
  opk:
    "One-time prekey: a prekey Bob uploads in bulk and uses exactly once, giving each first message its own extra forward-secrecy term (DH4).",
  "forward secrecy":
    "If a long-term key leaks later, past sessions stay safe — because each used an ephemeral/one-time key that no longer exists.",
  xeddsa:
    "A scheme that lets one X25519 key be used to make Ed25519-style signatures. Real X3DH uses it; this demo signs with plain Ed25519 as an in-spec stand-in.",
  "domain separator":
    "The 32 bytes of 0xFF prepended before the DH outputs. It guarantees the HKDF input can never collide with a raw curve encoding, keeping X25519 and X448 deployments from ever hashing the same bytes.",
  "info string":
    "The ASCII label 'WhisperText' fed into HKDF. It binds this derived key to the X3DH application so the same DH bytes used elsewhere would produce a different key."
};

function term(text: string, key: string): string {
  const def = GLOSSARY[key.toLowerCase()];
  if (!def) return text;
  const id = `gloss-${key.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return `<button type="button" class="gloss" aria-describedby="${id}"><span class="gloss-term">${text}</span><span class="gloss-pop" role="tooltip" id="${id}">${def}</span></button>`;
}

// ── Primitive chips ──────────────────────────────────────────────────────
function renderPrimitiveChips(): string {
  return `
    <ul class="primitive-chips" aria-label="Cryptographic primitives used">
      <li>X25519</li>
      <li>HKDF-SHA-256</li>
      <li>Ed25519</li>
    </ul>
  `;
}

// ── Timeline strip (asynchrony) ──────────────────────────────────────────
// The whole reason X3DH exists: Bob is offline at first contact. This makes
// the three beats visible instead of merely asserting them.
function renderTimeline(activeBeat: 0 | 1 | 2): string {
  const beats = [
    { t: "t0", who: "Bob", state: "offline", text: "publishes prekey bundle to the server, then goes dark" },
    { t: "t1", who: "Alice", state: "online", text: "fetches the bundle & derives SK — Bob never wakes up" },
    { t: "t2", who: "Bob", state: "online", text: "comes online, reconstructs the same SK, decrypts" }
  ];
  return `
    <ol class="timeline" aria-label="Asynchronous handshake timeline">
      ${beats
        .map((b, i) => {
          const cls = i === activeBeat ? "active" : i < activeBeat ? "done" : "";
          const bobOffline = (i === 0);
          return `<li class="tl-beat ${cls}" aria-current="${i === activeBeat ? "step" : "false"}">
            <span class="tl-dot" aria-hidden="true"></span>
            <span class="tl-t">${b.t}</span>
            <span class="tl-who tl-who--${bobOffline ? "offline" : b.state}">${b.who} ${bobOffline || b.state === "offline" ? "(offline)" : "(online)"}</span>
            <span class="tl-text">${b.text}</span>
          </li>`;
        })
        .join("")}
    </ol>
  `;
}

// ── Who-holds-what diagram ───────────────────────────────────────────────
// The central insight: Alice mixes HER privates with Bob's PUBLIC bundle; Bob
// later reconstructs the SAME secret from HIS privates + Alice's publics.
function renderHoldsWhat(data: DemoData): string {
  const b = data.bundle;
  return `
    <section class="holds panel-card" aria-labelledby="holds-heading">
      <h2 id="holds-heading">Who holds what</h2>
      <p class="holds-lead">
        Alice combines <strong>her own private keys</strong> with the
        <strong>public bundle</strong> Bob left on the server. Bob later combines
        <strong>his private keys</strong> with the <strong>public keys</strong> Alice
        sent — different material on each side, but the maths converge on one secret.
      </p>
      <div class="holds-grid">
        <div class="holds-box holds-box--alice">
          <h3>Alice — initiator</h3>
          <p class="holds-tag">privates never leave her device</p>
          <dl class="holds-keys">
            <dt>IK_A <span class="keytag keytag--priv">private</span></dt>
            <dd>${hexChip(data.alice.ikA.privateKey, "alice", true, "Alice identity private key")}</dd>
            <dt>EK_A <span class="keytag keytag--priv">private</span> · ${term("ephemeral key", "ephemeral key")}</dt>
            <dd>${hexChip(data.alice.ekA.privateKey, "alice", true, "Alice ephemeral private key")}</dd>
          </dl>
        </div>

        <div class="holds-box holds-box--server">
          <h3>Server bundle <span class="keytag keytag--pub">public</span></h3>
          <p class="holds-tag">Bob uploads this, then can go offline</p>
          <dl class="holds-keys">
            <dt>IK_B</dt><dd>${hexChip(b.ikBPub, "pub", false, "Bob identity public key")}</dd>
            <dt>SPK_B · ${term("signed prekey", "signed prekey")}</dt><dd>${hexChip(b.spkBPub, "pub", false, "Bob signed prekey public")}</dd>
            <dt>OPK_B · ${term("OPK", "opk")}</dt><dd>${data.withOpk ? hexChip(b.opkBPub, "pub", false, "Bob one-time prekey public") : hexChip(null, "pub", false, "OPK")}</dd>
          </dl>
        </div>

        <div class="holds-box holds-box--bob">
          <h3>Bob — recipient</h3>
          <p class="holds-tag">reconstructs SK when he returns</p>
          <dl class="holds-keys">
            <dt>IK_B <span class="keytag keytag--priv">private</span></dt>
            <dd>${hexChip(data.bob.ikB.privateKey, "bob", true, "Bob identity private key")}</dd>
            <dt>SPK_B <span class="keytag keytag--priv">private</span></dt>
            <dd>${hexChip(data.bob.spkB.privateKey, "bob", true, "Bob signed prekey private")}</dd>
            <dt>OPK_B <span class="keytag keytag--priv">private</span></dt>
            <dd>${data.withOpk ? hexChip(data.bob.opkB.privateKey, "bob", true, "Bob one-time prekey private") : hexChip(null, "bob", true, "OPK")}</dd>
          </dl>
        </div>
      </div>
      <p class="holds-legend" aria-hidden="true">
        <span class="lg lg--alice">Alice</span>
        <span class="lg lg--bob">Bob</span>
        <span class="lg lg--pub">public</span>
        <span class="lg lg--priv">private</span>
      </p>
    </section>
  `;
}

// ── Interactive lab controls ─────────────────────────────────────────────
function renderControls(scenario: Scenario): string {
  const toggle = (key: keyof Scenario, on: boolean, label: string, desc: string) => `
    <button type="button" class="lab-toggle ${on ? "on" : ""}" data-scenario="${key}" aria-pressed="${on}">
      <span class="lab-toggle-label">${label}</span>
      <span class="lab-toggle-state">${on ? "ON" : "off"}</span>
      <span class="lab-toggle-desc">${desc}</span>
    </button>`;
  return `
    <section class="lab-controls panel-card" aria-labelledby="lab-heading">
      <h2 id="lab-heading">Break it yourself</h2>
      <p class="lab-lead">Every toggle re-runs the real handshake in your browser and shows the true downstream effect. Nothing here is pre-baked.</p>
      <div class="lab-grid">
        <button type="button" class="lab-regen" id="lab-regenerate" aria-label="Regenerate all keys and re-run the handshake">↻ Regenerate all keys</button>
        ${toggle("tamperSpkSignature", scenario.tamperSpkSignature, "Tamper SPK signature", "flip a byte → Ed25519 verify fails")}
        ${toggle("dropOpk", scenario.dropOpk, "Drop one-time prekey", "omit DH4 → weaker forward secrecy, SK still forms")}
        ${toggle("corruptEkA", scenario.corruptEkA, "Corrupt EK_A byte on wire", "flip a byte → Bob's SK diverges, decrypt fails")}
      </div>
    </section>
  `;
}

// ── Status strip: live consequences ──────────────────────────────────────
function renderStatus(data: DemoData): string {
  const sig = data.signatureOk;
  const match = data.matchingSecrets;
  const decrypted = data.decryptedByBob !== null;
  const pill = (ok: boolean, okText: string, badText: string) =>
    `<span class="status-pill ${ok ? "ok" : "bad"}">${ok ? "✓ " + okText : "✗ " + badText}</span>`;
  return `
    <div class="status-strip" role="status" aria-live="polite" aria-label="Live handshake status">
      ${pill(sig, "Signature valid", "Signature INVALID")}
      ${pill(data.withOpk, "OPK present (DH4)", "OPK dropped (no DH4)")}
      ${pill(match, "Alice SK = Bob SK", "SK MISMATCH")}
      ${pill(decrypted, "Bob decrypted", "Decrypt FAILED")}
    </div>
  `;
}

// ── Panel 1: Key registry ────────────────────────────────────────────────
function renderPanel1(data: DemoData): string {
  return `
    <section class="panel-card">
      <h2>Panel 1: Key Registry — Bob's prekey bundle</h2>
      ${renderPrimitiveChips()}
      ${renderTimeline(0)}
      <p>
        Bob publishes a ${term("prekey", "prekey")} bundle to the server, then can go offline.
        Alice fetches it and begins a secure session <em>asynchronously</em> — the whole point of X3DH.
      </p>
      <div class="kv-grid">
        <div><strong>IK_B public (X25519)</strong>${hexChip(data.bundle.ikBPub, "pub", false, "IK_B public")}</div>
        <div><strong>SPK_B public (X25519)</strong>${hexChip(data.bundle.spkBPub, "pub", false, "SPK_B public")}</div>
        <div><strong>OPK_B public (X25519)</strong>${data.withOpk ? hexChip(data.bundle.opkBPub, "pub", false, "OPK_B public") : hexChip(null, "pub", false, "OPK_B")}</div>
        <div><strong>SPK signature (Ed25519)</strong>${hexChip(data.bundle.spkSignature, "bob", false, "SPK signature")}</div>
        <div><strong>Signing public key</strong>${hexChip(data.bundle.signingPub, "pub", false, "Signing public key")}</div>
        <div><strong>Signature verification</strong><code class="verdict ${data.signatureOk ? "verdict--ok" : "verdict--bad"}">${data.signatureOk ? "valid" : "INVALID — tampered"}</code></div>
      </div>
      <p class="small-note">Signature shown with Ed25519 as an in-spec equivalent to ${term("XEdDSA", "xeddsa")}-style SPK authentication in real X3DH deployments.</p>
    </section>
  `;
}

// ── Panel 2: Alice initiates ─────────────────────────────────────────────
function renderPanel2(data: DemoData): string {
  return `
    <section class="panel-card">
      <h2>Panel 2: Alice Initiates</h2>
      ${renderPrimitiveChips()}
      ${renderTimeline(1)}
      <p>Alice generates her identity key IK_A and a fresh ${term("ephemeral key", "ephemeral key")} EK_A, then fetches Bob's bundle. Bob is still offline.</p>
      <div class="kv-grid">
        <div><strong>IK_A public</strong>${hexChip(data.alice.ikA.publicKey, "alice", false, "IK_A public")}</div>
        <div><strong>EK_A public</strong>${hexChip(data.alice.ekA.publicKey, "alice", false, "EK_A public")}</div>
        <div><strong>Fetched IK_B public</strong>${hexChip(data.bundle.ikBPub, "pub", false, "IK_B public")}</div>
        <div><strong>Fetched SPK_B public</strong>${hexChip(data.bundle.spkBPub, "pub", false, "SPK_B public")}</div>
        <div><strong>Fetched OPK_B public</strong>${data.withOpk ? hexChip(data.bundle.opkBPub, "pub", false, "OPK_B public") : hexChip(null, "pub", false, "OPK_B")}</div>
        <div><strong>Fetched OPK id</strong><code>${data.withOpk ? data.bundle.opkId : "— (none)"}</code></div>
      </div>
    </section>
  `;
}

// ── Panel 3: Four DH ops with crossing diagram + view toggle ─────────────
type DhView = "alice" | "bob";
type Leg = 1 | 2 | 3 | 4;

// Each DH leg names the concrete key each side supplies. Alice's view puts HER
// private keys on the left and BOB's public keys on the right; Bob's view is the
// literal mirror — his private keys left, Alice's public keys right. The endpoint
// names below are what the crossing diagram anchors its lines to, so the drawn
// line for DHn always starts at its true left key and ends at its true right key.
function dhLegLabel(view: DhView, n: Leg): { left: string; right: string; label: string } {
  const A = {
    1: { left: "IK_A", right: "SPK_B", label: "mutual auth" },
    2: { left: "EK_A", right: "IK_B", label: "binds ephemeral → identity" },
    3: { left: "EK_A", right: "SPK_B", label: "forward secrecy" },
    4: { left: "EK_A", right: "OPK_B", label: "one-time forward secrecy" }
  } as const;
  const B = {
    1: { left: "SPK_B", right: "IK_A", label: "mutual auth" },
    2: { left: "IK_B", right: "EK_A", label: "binds ephemeral → identity" },
    3: { left: "SPK_B", right: "EK_A", label: "forward secrecy" },
    4: { left: "OPK_B", right: "EK_A", label: "one-time forward secrecy" }
  } as const;
  return view === "alice" ? A[n] : B[n];
}

// The colour of each DH line/label, keyed by leg so the SAME leg keeps the SAME
// colour across the viewpoint flip — that persistence is what makes the mirror
// legible: DH3 is teal on both sides, so you can watch one line re-anchor.
const LEG_CLASS: Record<Leg, string> = { 1: "1", 2: "2", 3: "3", 4: "4" };

// Ordered list of the UNIQUE key nodes in each column for a given view, so a key
// that participates in several DHs (EK_A in three of them) is drawn once and
// multiple lines fan out from the single node a learner can point at.
function crossNodes(view: DhView, withOpk: boolean): { left: string[]; right: string[] } {
  if (view === "alice") {
    return {
      left: ["IK_A", "EK_A"],
      right: withOpk ? ["SPK_B", "IK_B", "OPK_B"] : ["SPK_B", "IK_B"]
    };
  }
  return {
    left: withOpk ? ["SPK_B", "IK_B", "OPK_B"] : ["SPK_B", "IK_B"],
    right: ["IK_A", "EK_A"]
  };
}

// Vertical centre (0..100) of node i of a column of n evenly-spaced nodes.
function nodeY(index: number, count: number): number {
  const band = 100 / count;
  return band * index + band / 2;
}

function ownerClassOf(name: string): "alice" | "bob" | "pub" {
  if (name === "IK_A" || name === "EK_A") return "alice";
  return "pub"; // Bob's bundle keys are the public material on the wire
}

function renderCrossing(withOpk: boolean, view: DhView): string {
  const legs: Leg[] = withOpk ? [1, 2, 3, 4] : [1, 2, 3];
  const { left, right } = crossNodes(view, withOpk);
  const leftTitle = view === "alice" ? "Alice's privates" : "Bob's privates";
  const rightTitle = view === "alice" ? "Bob's publics" : "Alice's publics";
  const leftOwner = view === "alice" ? "alice" : "pub";
  const rightOwner = view === "alice" ? "pub" : "alice";

  const leftIndex = (name: string) => left.indexOf(name);
  const rightIndex = (name: string) => right.indexOf(name);

  const lines = legs
    .map((n) => {
      const leg = dhLegLabel(view, n);
      const y1 = nodeY(leftIndex(leg.left), left.length);
      const y2 = nodeY(rightIndex(leg.right), right.length);
      // Anchor a hair inside the node columns (x 8 → 92) so the line visibly
      // touches each labelled node rather than the card edge.
      return `<line class="cross-line cross-line--${LEG_CLASS[n]}" data-leg="${n}" x1="8" y1="${y1}" x2="92" y2="${y2}"><title>DH${n}: ${leg.left} × ${leg.right}</title></line>`;
    })
    .join("");

  const col = (names: string[]) =>
    names
      .map((name, i) => {
        const y = nodeY(i, names.length);
        return `<span class="cross-node cross-node--${ownerClassOf(name)}" data-key="${name}" style="top:${y}%">${name}</span>`;
      })
      .join("");

  return `
    <div class="cross" data-view="${view}">
      <div class="cross-headrow">
        <span class="cross-head cross-head--${leftOwner}">${leftTitle}</span>
        <span class="cross-head cross-head--${rightOwner}">${rightTitle}</span>
      </div>
      <div class="cross-stage">
        <div class="cross-nodecol cross-nodecol--left">${col(left)}</div>
        <svg class="cross-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
        <div class="cross-nodecol cross-nodecol--right">${col(right)}</div>
      </div>
      <ul class="cross-labels">
        ${legs
          .map((n) => {
            const leg = dhLegLabel(view, n);
            return `<li class="cross-label cross-label--${LEG_CLASS[n]}"><b>DH${n}</b> <span class="cross-label-pair">${leg.left} × ${leg.right}</span></li>`;
          })
          .join("")}
      </ul>
    </div>
  `;
}

// The one idea that makes X3DH click: DH(a, B) = DH(b, A) because both equal the
// point g^(ab)=g^(ba). We take ONE real leg (DH2: EK_A × IK_B) and show Alice's
// computation (her EK_A private × Bob's IK_B public) beside Bob's (his IK_B
// private × Alice's EK_A public), then reveal that the two 32-byte outputs are
// byte-for-byte identical. The bytes come straight from the live DH sets — if
// they ever differed, the highlight would show it honestly.
function renderCommutativity(data: DemoData): string {
  const aliceOut = data.aliceDh.dh2; // DH(EK_A_priv, IK_B_pub)
  const bobOut = data.bobDh.dh2; // DH(IK_B_priv, EK_A_pub)
  const aliceHex = bytesToHex(aliceOut);
  const bobHex = bytesToHex(bobOut);
  const identical = equalBytesHex(aliceHex, bobHex);
  return `
    <div class="commute" aria-labelledby="commute-heading">
      <h3 id="commute-heading" class="commute-h">Why do two different computations agree?</h3>
      <p class="commute-lead">
        Take one pair — <b>DH2</b>. Alice never sees Bob's private key and Bob
        never sees Alice's, yet they feed <em>opposite</em> inputs into X25519 and
        get the <em>same</em> 32 bytes. That is the whole trick:
        <code class="inline-code">DH(a, B) = DH(b, A)</code> because both equal
        <code class="inline-code">g<sup>ab</sup> = g<sup>ba</sup></code>.
      </p>
      <div class="commute-grid">
        <div class="commute-side commute-side--alice">
          <span class="commute-who">Alice computes</span>
          <code class="commute-expr">DH( EK_A<sub>priv</sub> , IK_B<sub>pub</sub> )</code>
          <span class="commute-arrow" aria-hidden="true">↓ X25519</span>
          <code class="commute-out" tabindex="0" role="region" aria-label="Alice's DH2 output, 32 bytes">${aliceHex}</code>
        </div>
        <div class="commute-side commute-side--bob">
          <span class="commute-who">Bob computes</span>
          <code class="commute-expr">DH( IK_B<sub>priv</sub> , EK_A<sub>pub</sub> )</code>
          <span class="commute-arrow" aria-hidden="true">↓ X25519</span>
          <code class="commute-out" tabindex="0" role="region" aria-label="Bob's DH2 output, 32 bytes">${bobHex}</code>
        </div>
      </div>
      <p class="commute-verdict ${identical ? "commute-verdict--same" : "commute-verdict--diff"}">
        ${identical
          ? "✓ Identical — byte for byte. Opposite inputs, one shared point."
          : "✗ These differ (a break-it toggle changed one side's input)."}
      </p>
      <button type="button" class="commute-regen" id="commute-regenerate" aria-label="Regenerate keys and recompute both sides">↻ New keys — watch it hold again</button>
    </div>
  `;
}

function equalBytesHex(a: string, b: string): boolean {
  return a.length === b.length && a === b;
}

function renderPanel3(data: DemoData, view: DhView): string {
  const rows: { n: 1 | 2 | 3 | 4; formA: string; formB: string; why: string; threat: string; dh: Uint8Array | null }[] = [
    { n: 1, formA: "DH(IK_A, SPK_B)", formB: "DH(SPK_B, IK_A)", why: "mutual authentication via Bob's signed prekey", threat: "Uses Alice's long-term identity IK_A against Bob's signed prekey. An attacker without Alice's IK_A private key cannot produce this term, so it authenticates the initiator to Bob.", dh: data.aliceDh.dh1 },
    { n: 2, formA: "DH(EK_A, IK_B)", formB: "DH(IK_B, EK_A)", why: "binds Alice's ephemeral to Bob's long-term identity", threat: "Mixes Alice's fresh ephemeral with Bob's long-term IK_B, so the session is bound to Bob's identity — a stranger who is not Bob cannot reconstruct it.", dh: data.aliceDh.dh2 },
    { n: 3, formA: "DH(EK_A, SPK_B)", formB: "DH(SPK_B, EK_A)", why: "fresh ephemeral contribution toward forward secrecy", threat: "Alice's single-use ephemeral against Bob's rotated signed prekey. Because EK_A is discarded after the handshake, a later theft of long-term keys cannot recompute this term.", dh: data.aliceDh.dh3 },
    { n: 4, formA: "DH(EK_A, OPK_B)", formB: "DH(OPK_B, EK_A)", why: "one-time prekey component adding one-time forward secrecy", threat: "Alice's ephemeral against a prekey Bob deletes after one use. Once consumed, neither side can regenerate it, giving even the first message its own forward secrecy.", dh: data.aliceDh.dh4 }
  ];
  const visible = data.withOpk ? rows : rows.slice(0, 3);
  return `
    <section class="panel-card">
      <h2>Panel 3: Four DH Operations</h2>
      ${renderPrimitiveChips()}
      <p>Four X25519 Diffie-Hellmans cross between the two sides. Each line below runs from the real private key one side holds to the real public key the other published. Toggle the viewpoint and watch each numbered line <em>re-anchor</em> to the mirrored keys — same colour, same pairing, opposite owners.</p>
      <div class="view-toggle" role="group" aria-label="Diagram viewpoint">
        <button type="button" class="view-btn ${view === "alice" ? "active" : ""}" data-view="alice" aria-pressed="${view === "alice"}">Alice's view</button>
        <button type="button" class="view-btn ${view === "bob" ? "active" : ""}" data-view="bob" aria-pressed="${view === "bob"}">Bob's view</button>
      </div>
      ${renderCrossing(data.withOpk, view)}
      ${renderCommutativity(data)}
      <div class="dh-list">
        ${visible
          .map(
            (r) => `
          <article class="dh-item dh-item--${r.n}">
            <h3>DH${r.n} = ${view === "alice" ? r.formA : r.formB}</h3>
            <p>${r.why}.</p>
            <details class="dh-threat">
              <summary>What it defends against</summary>
              <p>${r.threat}</p>
            </details>
            ${hexChip(r.dh, view, false, `DH${r.n} output`)}
          </article>`
          )
          .join("")}
        ${!data.withOpk ? `<article class="dh-item dh-item--absent"><h3>DH4 — omitted</h3><p>No one-time prekey this session, so DH4 is dropped. The secret still forms from DH1–DH3; it just loses the extra one-time forward-secrecy term.</p></article>` : ""}
      </div>
    </section>
  `;
}

// The KDF input is literally F ‖ DH1 ‖ DH2 ‖ … concatenated, then hashed. This
// makes that concrete: each colored DH chip is a 32-byte block; on entry they
// slide into a single contiguous KM strip (with its true byte length shown),
// which then feeds one HKDF box that emits the 32-byte SK. Reusing the owner
// colors keeps every DHn region identifiable inside the assembled KM.
function renderConvergence(legs: Leg[], skHex: string): string {
  const blockCount = legs.length + 1; // +1 for the F domain separator
  const kmBytes = blockCount * 32;
  const skShort = `${skHex.slice(0, 8)}…${skHex.slice(-8)}`;
  const fBlock = `<span class="km-block km-block--f" style="--i:0"><span class="km-block-label">F</span><span class="km-block-bytes">32 B · 0xFF…</span></span>`;
  const dhBlocks = legs
    .map(
      (n, idx) =>
        `<span class="km-block km-block--${LEG_CLASS[n]}" style="--i:${idx + 1}"><span class="km-block-label">DH${n}</span><span class="km-block-bytes">32 B</span></span>`
    )
    .join("");
  return `
    <div class="converge2" aria-label="How the shared secret is assembled from concatenated DH outputs">
      <p class="converge2-cap">
        <b>Step 1 — concatenate.</b> The domain separator <b>F</b> and each 32-byte
        DH output line up head-to-tail into one byte string
        <code class="inline-code">KM</code> (${kmBytes} bytes):
      </p>
      <div class="km-strip" role="img" aria-label="Concatenated key material: F followed by ${legs.length} DH outputs, ${kmBytes} bytes total">
        ${fBlock}${dhBlocks}
        <span class="km-len">= ${kmBytes} bytes</span>
      </div>
      <div class="converge2-flow" aria-hidden="true">
        <span class="km-arrow">↓ feed KM as HKDF input keying material</span>
      </div>
      <p class="converge2-cap">
        <b>Step 2 — hash.</b> HKDF-SHA-256 extracts and expands those ${kmBytes} bytes
        into exactly 32 bytes of session key:
      </p>
      <div class="km-hkdf-row">
        <span class="hkdf-box hkdf-box--anim">HKDF-SHA-256</span>
        <span class="km-out-arrow" aria-hidden="true">→</span>
        <span class="km-sk"><span class="km-sk-label">SK</span><code class="km-sk-hex">${skShort}</code><span class="km-sk-bytes">32 B</span></span>
      </div>
      <p class="small-note converge2-note">The secret <em>is</em> those concatenated DH bytes, hashed — not a lookup or a stored value. Change any DH block (try a break-it toggle) and this output changes with it.</p>
    </div>
  `;
}

// ── Panel 4: Convergence into HKDF ───────────────────────────────────────
function renderPanel4(data: DemoData): string {
  const legs: (1 | 2 | 3 | 4)[] = data.withOpk ? [1, 2, 3, 4] : [1, 2, 3];
  const aliceHex = bytesToHex(data.aliceSk);
  const bobHex = bytesToHex(data.bobSk);
  const match = data.matchingSecrets;

  // Byte-level diff so an expert can see WHERE tampered inputs made them differ.
  const diff = (() => {
    if (match) return "";
    const a = aliceHex;
    const b = bobHex;
    const len = Math.max(a.length, b.length);
    let out = "";
    for (let i = 0; i < len; i += 2) {
      const pa = a.slice(i, i + 2);
      const pb = b.slice(i, i + 2);
      out += pa === pb ? `<span>${pa}</span>` : `<span class="diff-byte">${pa || "··"}</span>`;
    }
    return `<div class="sk-diff"><span class="sk-diff-label">Diff (Alice vs Bob, red = differing byte):</span><code class="sk-diff-code" tabindex="0" role="region" aria-label="Byte diff of the two shared secrets">${out}</code></div>`;
  })();

  return `
    <section class="panel-card">
      <h2>Panel 4: KDF → Shared Secret</h2>
      ${renderPrimitiveChips()}
      ${renderTimeline(2)}
      <p>
        X3DH forms <code class="inline-code">KM = F ‖ DH1 ‖ DH2 ‖ DH3${data.withOpk ? " ‖ DH4" : ""}</code>, then runs it through HKDF-SHA-256.
        <strong>F</strong> is 32 bytes of 0xFF — the ${term("domain separator", "domain separator")}. The ${term("info string", "info string")}
        <code class="inline-code">"${X3DH_INFO_STRING}"</code> binds the output to this application.
      </p>

      ${renderConvergence(legs, aliceHex)}

      <div class="sk-compare ${match ? "sk-compare--match" : "sk-compare--mismatch"}">
        <div class="sk-row">
          <span class="sk-label sk-label--alice">Alice SK</span>
          <code class="sk-hex" tabindex="0" role="region" aria-label="Alice derived shared secret">${aliceHex}</code>
        </div>
        <div class="sk-verdict">${match ? "▲ byte-for-byte identical ▼" : "✗ secrets differ — see diff below"}</div>
        <div class="sk-row">
          <span class="sk-label sk-label--bob">Bob SK</span>
          <code class="sk-hex" tabindex="0" role="region" aria-label="Bob derived shared secret">${bobHex}</code>
        </div>
      </div>
      ${diff}
      <p class="small-note">
        Signal X3DH specification: <a href="https://signal.org/docs/specifications/x3dh/" target="_blank" rel="noreferrer">signal.org/docs/specifications/x3dh</a>
      </p>
    </section>
  `;
}

// ── Panel 5: Handoff ─────────────────────────────────────────────────────
function renderPanel5(data: DemoData): string {
  const ok = data.decryptedByBob !== null;
  return `
    <section class="panel-card">
      <h2>Panel 5: Handoff to Double Ratchet</h2>
      ${renderPrimitiveChips()}
      <p>
        Alice's initial message carries EK_A pubkey, IK_A pubkey, the selected OPK id, and ciphertext.
        Bob reconstructs SK from his side and decrypts.
      </p>
      <div class="kv-grid">
        <div><strong>Header: EK_A public</strong>${hexChip(data.initialMessage.ekAPub, "alice", false, "EK_A on wire")}</div>
        <div><strong>Header: IK_A public</strong>${hexChip(data.initialMessage.ikAPub, "alice", false, "IK_A on wire")}</div>
        <div><strong>Header: OPK_B id</strong><code>${data.withOpk ? data.initialMessage.opkId : "— (none)"}</code></div>
        <div><strong>AES-GCM IV</strong>${hexChip(data.initialMessage.iv, "pub", false, "AES-GCM IV")}</div>
        <div><strong>First encrypted message</strong>${hexChip(data.initialMessage.ciphertext, "pub", false, "Ciphertext")}</div>
        <div><strong>Bob decrypts</strong><code class="verdict ${ok ? "verdict--ok" : "verdict--bad"}">${ok ? data.decryptedByBob : "✗ authentication failed — key mismatch"}</code></div>
      </div>
      <p class="bridge-text">This SK becomes the root key for the Double Ratchet — see <a href="https://github.com/systemslibrarian/crypto-lab-ratchet-wire" target="_blank" rel="noreferrer">crypto-lab-ratchet-wire</a>.</p>
    </section>
  `;
}

const PANEL_LABELS = [
  "Key Registry",
  "Alice Initiates",
  "Four DH Operations",
  "KDF + Shared Secret",
  "Handoff to Double Ratchet"
];

// ── App-level render state ───────────────────────────────────────────────
type LabState = {
  scenario: Scenario;
  seed: { bob: BobState; alice: AliceState };
  panelIndex: number;
  dhView: DhView;
  // Progressive disclosure: the tamper/status experiments stay hidden until the
  // learner has walked the handshake through to the final panel at least once.
  // You must understand what the handshake builds before you are handed tools to
  // break it — so "build first, then break" is enforced, not merely suggested.
  experimentsUnlocked: boolean;
};

function renderPanel(data: DemoData, state: LabState): string {
  switch (state.panelIndex) {
    case 0:
      return renderPanel1(data);
    case 1:
      return renderPanel2(data);
    case 2:
      return renderPanel3(data, state.dhView);
    case 3:
      return renderPanel4(data);
    default:
      return renderPanel5(data);
  }
}

function renderStaticSections(): string {
  return `
    <section class="why-matters panel-card" aria-labelledby="why-heading">
      <h2 id="why-heading">Why this matters</h2>
      <p><strong>Asynchronous messaging:</strong> Alice can start a secure session while Bob is offline by using Bob's prekey bundle.</p>
      <p><strong>Offline recipients:</strong> Bob uploads signed prekeys and one-time prekeys ahead of time, enabling first-contact encryption.</p>
      <p><strong>Forward secrecy from first message:</strong> ephemeral keys and consumed OPKs reduce damage from future key compromise.</p>
    </section>

    <nav class="links-row" aria-label="Related demos and resources">
      <a class="badge" href="https://github.com/systemslibrarian/crypto-lab-ratchet-wire" target="_blank" rel="noreferrer">Related: crypto-lab-ratchet-wire</a>
      <a class="badge" href="https://github.com/systemslibrarian/crypto-compare" target="_blank" rel="noreferrer">Category: crypto-compare Key Agreement</a>
      <a class="badge" href="https://github.com/systemslibrarian/crypto-lab" target="_blank" rel="noreferrer">crypto-lab landing page</a>
      <a class="badge" href="https://github.com/systemslibrarian/crypto-lab-x3dh-wire" target="_blank" rel="noreferrer">GitHub: crypto-lab-x3dh-wire</a>
    </nav>
  `;
}

// Shown at the end of the walkthrough (or once unlocked): the invitation that
// turns on the tamper experiments. Gating the break-it tools behind this prompt
// is the progressive-disclosure fix — you build the handshake before you break it.
function renderExperimentGate(state: LabState, atLastPanel: boolean): string {
  if (state.experimentsUnlocked) return "";
  const ready = atLastPanel;
  return `
    <section class="exp-gate ${ready ? "exp-gate--ready" : "exp-gate--waiting"}" aria-labelledby="exp-gate-heading">
      <h2 id="exp-gate-heading">${ready ? "Now try breaking it" : "Break-it experiments — locked"}</h2>
      <p class="exp-gate-lead">${
        ready
          ? "You've watched the handshake build a shared secret end to end. Unlock the live tamper controls to attack it — flip the signature, drop the one-time prekey, or corrupt a key on the wire, and watch the real crypto react."
          : "Walk the five panels first. The tamper controls unlock once you reach the final panel, so you break the handshake only after you've seen what it builds."
      }</p>
      <button type="button" id="unlock-experiments" class="exp-gate-btn" ${ready ? "" : "disabled"} aria-label="Unlock the break-it experiments">
        ${ready ? "↯ Unlock break-it experiments" : "Reach Panel 5 to unlock"}
      </button>
    </section>
  `;
}

function renderAppShell(data: DemoData, state: LabState): string {
  const panelIndex = state.panelIndex;
  const atLastPanel = panelIndex === PANEL_LABELS.length - 1;
  return `
    <main id="main-content" class="app-shell" aria-label="X3DH Protocol Demo">
      <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Switch to light mode" hidden>🌙</button>
      <header class="cl-hero">
        <div class="cl-hero-main">
          <h1 class="cl-hero-title">X3DH</h1>
          <p class="cl-hero-sub">Extended Triple Diffie-Hellman · X25519 + HKDF</p>
          <p class="cl-hero-desc">Derives a shared secret from Bob's offline prekey bundle by combining four X25519 DH operations through HKDF, so you can watch Alice open an encrypted session before Bob ever comes online.</p>
        </div>
        <aside class="cl-hero-why" aria-label="Why it matters">
          <span class="cl-hero-why-label">WHY IT MATTERS</span>
          <p class="cl-hero-why-text">Secure messengers must let people start a conversation without both parties being online at once. X3DH is the handshake Signal and WhatsApp use to make that first message private, and its forward secrecy limits the damage if a key is later stolen.</p>
        </aside>
      </header>

      <p class="guide-lead">Follow the five panels in order — each shows the real bytes at that step. Bob is offline until the last beat; watch Alice derive a shared secret he can later reconstruct.</p>

      ${renderHoldsWhat(data)}

      <nav class="stepper" aria-label="Protocol step selector">
        ${PANEL_LABELS.map((label, idx) => {
          const current = idx === panelIndex;
          return `<button class="step-btn ${current ? "active" : ""}" data-step="${idx}" aria-label="Panel ${idx + 1}: ${label}" aria-current="${current ? "step" : "false"}">Panel ${idx + 1}</button>`;
        }).join("")}
      </nav>

      <section id="panel-host" tabindex="-1" aria-live="polite" aria-atomic="true" role="region" aria-label="Step ${panelIndex + 1} of ${PANEL_LABELS.length}: ${PANEL_LABELS[panelIndex]}">${renderPanel(data, state)}</section>

      <div class="walkthrough-controls" role="group" aria-label="Panel navigation">
        <button id="prev-panel" type="button" aria-label="Previous panel" ${panelIndex === 0 ? "disabled" : ""}>Previous</button>
        <button id="next-panel" type="button" aria-label="Next panel" ${atLastPanel ? "disabled" : ""}>Next</button>
      </div>

      ${renderExperimentGate(state, atLastPanel)}
      ${state.experimentsUnlocked ? `<div class="experiments" id="experiments">${renderStatus(data)}${renderControls(state.scenario)}</div>` : ""}

      ${renderStaticSections()}
    </main>
  `;
}

// ── Theme toggle ─────────────────────────────────────────────────────────
function updateThemeToggleUi(theme: "dark" | "light") {
  const button = document.querySelector<HTMLButtonElement>("#theme-toggle");
  if (!button) return;
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
  if (!button) return;
  updateThemeToggleUi(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  button.addEventListener("click", () => {
    const root = document.documentElement;
    const next: "dark" | "light" = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("theme", next);
    updateThemeToggleUi(next);
  });
}

// ── Hex chip expand/collapse (delegated) ─────────────────────────────────
function wireHexChips() {
  document.addEventListener("click", (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>(".hexchip");
    if (!chip || chip.classList.contains("hexchip--absent")) return;
    const hexEl = chip.querySelector<HTMLElement>(".hexchip-hex");
    if (!hexEl) return;
    const expanded = chip.classList.toggle("expanded");
    hexEl.textContent = expanded ? (chip.dataset.full ?? "") : (chip.dataset.short ?? "");
  });
}

// ── Main controller: re-render on every interaction ──────────────────────
export async function renderDemo() {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("Missing #app container.");
  }

  const state: LabState = {
    scenario: { ...DEFAULT_SCENARIO },
    seed: { bob: createBobState(), alice: createAliceState() },
    panelIndex: 0,
    dhView: "alice",
    experimentsUnlocked: false
  };

  applyTheme();

  // Rebuild the whole shell from freshly-computed, real crypto. Keeping this a
  // full re-render keeps the visualization and the actual bytes in lock-step.
  const rerender = async (focus: "panel" | "experiments" | "none") => {
    const data = await buildDemoState(state.scenario, state.seed);
    app.innerHTML = renderAppShell(data, state);
    wireThemeToggle();
    if (focus === "panel") {
      document.querySelector<HTMLElement>("#panel-host")?.focus();
    } else if (focus === "experiments") {
      const exp = document.querySelector<HTMLElement>("#experiments");
      if (exp) {
        exp.setAttribute("tabindex", "-1");
        exp.focus();
        exp.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  await rerender("none");
  wireHexChips();

  // Delegated interaction handling survives every re-render.
  app.addEventListener("click", async (event) => {
    const el = event.target as HTMLElement;

    const stepBtn = el.closest<HTMLButtonElement>(".step-btn");
    if (stepBtn) {
      state.panelIndex = Number(stepBtn.dataset.step ?? "0");
      await rerender("panel");
      return;
    }
    if (el.closest("#prev-panel")) {
      state.panelIndex = Math.max(0, state.panelIndex - 1);
      await rerender("panel");
      return;
    }
    if (el.closest("#next-panel")) {
      state.panelIndex = Math.min(PANEL_LABELS.length - 1, state.panelIndex + 1);
      await rerender("panel");
      return;
    }
    const viewBtn = el.closest<HTMLButtonElement>(".view-btn");
    if (viewBtn) {
      state.dhView = (viewBtn.dataset.view as DhView) ?? "alice";
      await rerender("none");
      return;
    }
    if (el.closest("#unlock-experiments")) {
      state.experimentsUnlocked = true;
      await rerender("experiments");
      return;
    }
    // Both the "who holds what" regenerate and the commutativity "new keys"
    // button reseed the same live crypto so every value on the page recomputes.
    if (el.closest("#lab-regenerate") || el.closest("#commute-regenerate")) {
      state.seed = { bob: createBobState(), alice: createAliceState() };
      await rerender("none");
      return;
    }
    const labToggle = el.closest<HTMLButtonElement>(".lab-toggle");
    if (labToggle) {
      const key = labToggle.dataset.scenario as keyof Scenario;
      state.scenario = { ...state.scenario, [key]: !state.scenario[key] };
      await rerender("none");
      return;
    }
  });

  // Arrow-key navigation on the stepper.
  app.addEventListener("keydown", async (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest(".stepper")) return;
    const last = PANEL_LABELS.length - 1;
    let next = state.panelIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(last, state.panelIndex + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, state.panelIndex - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    state.panelIndex = next;
    await rerender("none");
    document.querySelectorAll<HTMLButtonElement>(".step-btn")[next]?.focus();
  });
}
