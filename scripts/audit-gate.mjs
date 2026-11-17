#!/usr/bin/env node
/**
 * Garde-fou d'audit npm pour la CI.
 *
 * `npm audit --audit-level=high` est un interrupteur tout-ou-rien : dès qu'une
 * vulnérabilité est publiée sans version corrigée disponible, il bloque toutes
 * les PR — y compris celles qui n'ont aucun rapport — et il n'existe aucun moyen
 * de dire « on a vu, on a évalué, ce n'est pas exploitable ici ».
 *
 * Ce script garde le même niveau d'exigence (aucune vulnérabilité high/critical
 * tolérée) mais autorise des exceptions EXPLICITES, datées et justifiées :
 *
 *   - une entrée de `audit-allowlist.json` porte un identifiant d'avis
 *     (GHSA/CVE), la raison de l'exception et une date d'expiration ;
 *   - une exception expirée fait ÉCHOUER le job : impossible d'oublier une
 *     dérogation ;
 *   - toute vulnérabilité high/critical non couverte fait échouer le job ;
 *   - une exception devenue inutile (avis corrigé en amont) est signalée.
 *
 * Une vulnérabilité « héritée » (paquet sain qui dépend d'un paquet vulnérable)
 * n'est excusée que si TOUS ses chemins de vulnérabilité mènent à une exception.
 *
 * Usage : node scripts/audit-gate.mjs [--omit=dev]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const allowlistPath = join(here, "audit-allowlist.json");
const root = resolve(here, "..");
const today = new Date().toISOString().slice(0, 10);

const allowlist = existsSync(allowlistPath)
  ? JSON.parse(readFileSync(allowlistPath, "utf8"))
  : [];

const extraArgs = process.argv.slice(2); // ex. --omit=dev

let raw;
try {
  raw = execFileSync("npm", ["audit", "--json", ...extraArgs], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 32 * 1024 * 1024,
  });
} catch (error) {
  // `npm audit` sort en code != 0 dès qu'il trouve quelque chose : le rapport
  // JSON reste lisible sur stdout.
  raw = error.stdout ?? "";
}
if (!raw.trim()) {
  console.error(`❌ npm audit n'a produit aucune sortie exploitable (${root})`);
  process.exit(1);
}

const report = JSON.parse(raw);
const vulnerabilities = report.vulnerabilities ?? {};
const active = allowlist.filter((entry) => entry.expires >= today);
const expired = allowlist.filter((entry) => entry.expires < today);

/** Une entrée d'allowlist couvre-t-elle cet avis pour ce paquet ? */
const coveredByEntry = (packageName, advisory) =>
  active.find(
    (entry) =>
      entry.package === packageName && advisory.includes(entry.advisory),
  );

/**
 * Un paquet est-il excusé ?
 * - toutes ses voies de vulnérabilité doivent être couvertes : un avis listé
 *   dans `via` (objet) doit avoir son exception, un paquet parent (chaîne)
 *   doit être lui-même excusé (récursion) ;
 * - un `via` vide signifie un avis sans détail : jamais excusé.
 */
const memo = new Map();
function isExcused(name, stack = new Set()) {
  if (memo.has(name)) return memo.get(name);
  const node = vulnerabilities[name];
  if (!node) return true; // pas vulnérable : rien à excuser
  if (stack.has(name)) return false; // cycle : on refuse par prudence
  stack.add(name);

  const via = node.via ?? [];
  const excused =
    via.length > 0 &&
    via.every((entry) =>
      typeof entry === "object"
        ? Boolean(
            coveredByEntry(name, `${entry.url ?? ""} ${entry.title ?? ""}`),
          )
        : isExcused(entry, stack),
    );

  stack.delete(name);
  memo.set(name, excused);
  return excused;
}

const findings = Object.entries(vulnerabilities)
  .filter(
    ([, node]) => node.severity === "high" || node.severity === "critical",
  )
  .map(([name, node]) => ({
    name,
    severity: node.severity,
    via: node.via ?? [],
  }));

const blocking = findings.filter((finding) => !isExcused(finding.name));
const suppressed = findings.filter((finding) => isExcused(finding.name));
const unused = active.filter(
  (entry) =>
    !suppressed.some((finding) => {
      // L'exception a servi si elle couvre un avis direct ou un parent du graphe.
      if (finding.name === entry.package) return true;
      return finding.via.some(
        (via) =>
          via === entry.package ||
          (typeof via === "object" &&
            `${via.url ?? ""} ${via.title ?? ""}`.includes(entry.advisory)),
      );
    }),
);

for (const entry of active) {
  if (unused.includes(entry)) continue;
  console.log(
    `ℹ️  Exception appliquée : ${entry.package} — ${entry.advisory}\n` +
      `   raison : ${entry.reason}\n   expire le ${entry.expires}`,
  );
}

if (unused.length > 0) {
  console.warn(
    "⚠️  Exception(s) devenue(s) inutile(s), à retirer de scripts/audit-allowlist.json :\n" +
      unused
        .map((entry) => `   - ${entry.package} (${entry.advisory})`)
        .join("\n"),
  );
}

if (expired.length > 0) {
  console.error(
    "❌ Exception(s) expirée(s) — réévaluer la vulnérabilité puis corriger ou prolonger :\n" +
      expired
        .map(
          (entry) =>
            `   - ${entry.package} (${entry.advisory}) expirée le ${entry.expires}`,
        )
        .join("\n"),
  );
}

if (blocking.length > 0) {
  console.error(
    `❌ ${blocking.length} vulnérabilité(s) high/critical non couverte(s) par une exception :\n` +
      blocking
        .map((finding) => `   - ${finding.name} (${finding.severity})`)
        .join("\n") +
      "\n   → corriger la dépendance, ou ajouter une exception justifiée et datée.",
  );
}

if (blocking.length > 0 || expired.length > 0) process.exit(1);

console.log(
  suppressed.length === 0
    ? "✅ npm audit : aucune vulnérabilité high/critical."
    : `✅ npm audit : ${suppressed.length} vulnérabilité(s) héritée(s) couverte(s) par exception, aucune non traitée.`,
);
