/**
 * Profile Readiness Checker
 *
 * Validates whether a language profile meets its test requirements
 * by checking against the actual rules engine and available capabilities.
 * Used to gate which languages get "deep analysis" vs "basic analysis".
 */

import type { LanguageProfile } from "./language-profiles.js";
import { ALL_PROFILES, getProfile } from "./language-profiles.js";
import {
  createDefaultRulesEngineWithSemanticRules,
} from "./rules-engine.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProfileStatus {
  profileId: string;
  ready: boolean;
  staticRuleCoverage: number;
  semanticRuleCoverage: number;
  migrationCoverage: number;
  hasRealWorldTest: boolean;
  missingCapabilities: string[];
  message: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check readiness of a single language profile against the actual rules engine.
 */
export function checkProfileReadiness(profile: LanguageProfile): ProfileStatus {
  const engine = createDefaultRulesEngineWithSemanticRules();
  const missingCapabilities: string[] = [];

  // --- Static rule coverage ---
  // Check which of the profile's declared static rules actually exist in the engine
  // We check by getting all rules and matching IDs
  const allRules = engine.getRulesForLanguage(profile.id === "typescript" ? "typescript" : profile.id);
  const allRuleIds = new Set(allRules.map((r) => r.id));

  // Also get universal rules (language "all")
  const universalRules = engine.getRulesForLanguage("__any__");
  for (const r of universalRules) {
    allRuleIds.add(r.id);
  }

  // For a more complete check, get ALL registered rules
  const registeredFortranRules = engine.getRulesForLanguage("fortran");
  for (const r of registeredFortranRules) allRuleIds.add(r.id);
  const registeredTsRules = engine.getRulesForLanguage("typescript");
  for (const r of registeredTsRules) allRuleIds.add(r.id);
  const registeredJsRules = engine.getRulesForLanguage("javascript");
  for (const r of registeredJsRules) allRuleIds.add(r.id);
  const registeredTsxRules = engine.getRulesForLanguage("tsx");
  for (const r of registeredTsxRules) allRuleIds.add(r.id);
  const registeredJsxRules = engine.getRulesForLanguage("jsx");
  for (const r of registeredJsxRules) allRuleIds.add(r.id);

  const matchedStaticRules = profile.staticRules.filter((id) => allRuleIds.has(id));
  const missingStaticRules = profile.staticRules.filter((id) => !allRuleIds.has(id));
  const staticRequired = profile.testRequirements.minStaticRuleTests;
  const staticCoverage = staticRequired > 0
    ? Math.round((matchedStaticRules.length / staticRequired) * 100)
    : 100;

  if (missingStaticRules.length > 0) {
    missingCapabilities.push(`Missing static rules: ${missingStaticRules.join(", ")}`);
  }

  // --- Semantic capability coverage ---
  const caps = profile.semanticCapabilities;
  const enabledCaps: string[] = [];
  const capEntries: Array<[string, boolean]> = [
    ["controlFlowAnalysis", caps.controlFlowAnalysis],
    ["dataFlowAnalysis", caps.dataFlowAnalysis],
    ["callGraphExtraction", caps.callGraphExtraction],
    ["migrationScoring", caps.migrationScoring],
    ["numericalAnalysis", caps.numericalAnalysis],
    ["memoryAnalysis", caps.memoryAnalysis],
    ["concurrencyAnalysis", caps.concurrencyAnalysis],
    ["typeSystemAnalysis", caps.typeSystemAnalysis],
  ];
  for (const [name, enabled] of capEntries) {
    if (enabled) enabledCaps.push(name);
  }
  const semanticRequired = profile.testRequirements.minSemanticTests;
  const semanticCoverage = semanticRequired > 0
    ? Math.round((enabledCaps.length / semanticRequired) * 100)
    : 100;

  if (enabledCaps.length < semanticRequired) {
    missingCapabilities.push(
      `Need ${semanticRequired - enabledCaps.length} more semantic capabilities enabled`,
    );
  }

  // --- Migration coverage ---
  const migrationCount = profile.migrationTargets.length;
  const migrationRequired = profile.testRequirements.minMigrationTests;
  const migrationCoverage = migrationRequired > 0
    ? Math.round((migrationCount / migrationRequired) * 100)
    : 100;

  if (migrationCount < migrationRequired) {
    missingCapabilities.push(
      `Need ${migrationRequired - migrationCount} more migration targets defined`,
    );
  }

  // --- Real-world test ---
  const hasRealWorldTest = !profile.testRequirements.requireRealWorldTest ||
    (profile.testRequirements.realWorldRepo !== undefined && profile.testRequirements.realWorldRepo.length > 0);

  if (profile.testRequirements.requireRealWorldTest && !hasRealWorldTest) {
    missingCapabilities.push("Missing real-world test repository");
  }

  // --- Ready? ---
  const ready =
    profile.staticRules.length >= staticRequired &&
    matchedStaticRules.length >= staticRequired &&
    enabledCaps.length >= semanticRequired &&
    migrationCount >= migrationRequired &&
    (enabledCaps.length > 0 || semanticRequired === 0);

  // --- Build message ---
  let message: string;
  if (ready) {
    message = `${profile.name}: READY for deep analysis (${matchedStaticRules.length} static rules, ${enabledCaps.length} semantic capabilities, ${migrationCount} migration targets)`;
  } else {
    const issues = missingCapabilities.length > 0
      ? missingCapabilities.join("; ")
      : "Insufficient coverage";
    message = `${profile.name}: NOT READY — ${issues}`;
  }

  return {
    profileId: profile.id,
    ready,
    staticRuleCoverage: Math.min(staticCoverage, 100),
    semanticRuleCoverage: Math.min(semanticCoverage, 100),
    migrationCoverage: Math.min(migrationCoverage, 100),
    hasRealWorldTest,
    missingCapabilities,
    message,
  };
}

/**
 * Check readiness of all registered language profiles.
 */
export function checkAllProfiles(): ProfileStatus[] {
  return ALL_PROFILES.map((p) => checkProfileReadiness(p));
}

/**
 * Get a human-readable summary of all profile statuses.
 */
export function getProfileSummary(): {
  ready: string[];
  partial: string[];
  stub: string[];
} {
  const statuses = checkAllProfiles();
  const ready: string[] = [];
  const partial: string[] = [];
  const stub: string[] = [];

  for (const s of statuses) {
    const profile = getProfile(s.profileId);
    if (!profile) continue;

    if (s.ready) {
      ready.push(profile.name);
    } else if (profile.staticRules.length > 0) {
      partial.push(profile.name);
    } else {
      stub.push(profile.name);
    }
  }

  return { ready, partial, stub };
}
