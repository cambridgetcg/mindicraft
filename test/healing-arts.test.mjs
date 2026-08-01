import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { prepareHealingArts } from '../guide/healing-arts.mjs';

const sourceBytes = readFileSync(
  new URL('../guide/healing-arts.json', import.meta.url)
);
const liveSource = JSON.parse(sourceBytes);
const fresh = () => structuredClone(liveSource);
const prepare = (source, bytes = Buffer.from(JSON.stringify(source))) =>
  prepareHealingArts(source, { sourceBytes: bytes });
const tradition = (source, id) =>
  source.traditions.find((entry) => entry.id === id);

function replaceCitations(value, replacements) {
  if (Array.isArray(value)) {
    value.forEach((entry) => replaceCitations(entry, replacements));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'source_ids') {
      value[key] = [
        ...new Set(
          child.map((id) => replacements.get(id) ?? id)
        ),
      ];
    } else {
      replaceCitations(child, replacements);
    }
  }
}

test('the live healing-arts source prepares deterministically without mutation', () => {
  const source = fresh();
  const before = structuredClone(source);
  const first = prepareHealingArts(source, { sourceBytes });
  const second = prepareHealingArts(source, { sourceBytes });

  assert.deepEqual(source, before);
  assert.equal(first.sourceDigest, second.sourceDigest);
  assert.match(first.sourceDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(first.counts, { sources: 35, traditions: 14 });
  assert.equal(
    first.traditionsById['first-nations-health-authority-bc-overview'].name,
    'A First Nations Health Authority overview of traditional wellness'
  );
  assert.equal(
    first.traditionsById['rongoa-maori-aotearoa'].name,
    'Rongoā Māori in one Te Papa account'
  );
  assert.equal(Object.keys(first.sourcesById).length, 35);
});
test('the preparer is computation-only and contains no I/O or network client', () => {
  const moduleText = readFileSync(
    new URL('../guide/healing-arts.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(moduleText, /from ['"]node:fs/u);
  assert.doesNotMatch(moduleText, /\bfetch\s*\(/u);
  assert.doesNotMatch(moduleText, /\b(?:writeFile|appendFile|createWriteStream)\s*\(/u);
});

test('the top-level and nested schemas fail closed', () => {
  const top = fresh();
  top.lineages = [];
  assert.throws(() => prepare(top), /unknown field lineages/u);

  const nested = fresh();
  nested.traditions[0].legacy = [];
  assert.throws(() => prepare(nested), /unknown field legacy/u);

  const claim = fresh();
  claim.traditions[0].healing_aims[0].confidence = 1;
  assert.throws(() => prepare(claim), /unknown field confidence/u);

  const version = fresh();
  version.schema_version = 'mindicraft.healing-arts-source/2';
  assert.throws(() => prepare(version), /unsupported schema_version/u);
});

test('the shelf accepts eight to sixteen traditions and no other count', () => {
  const tooFew = fresh();
  tooFew.traditions = tooFew.traditions.slice(0, 7);
  assert.throws(() => prepare(tooFew), /must contain 8-16 items/u);

  const tooMany = fresh();
  tooMany.traditions.push(
    structuredClone(tooMany.traditions[0]),
    structuredClone(tooMany.traditions[1]),
    structuredClone(tooMany.traditions[2])
  );
  assert.throws(() => prepare(tooMany), /must contain 8-16 items/u);
});

test('review and observation dates are real and do not cross the review date', () => {
  const impossible = fresh();
  impossible.reviewed_at = '2026-02-30';
  assert.throws(() => prepare(impossible), /real calendar date/u);

  const sourceLater = fresh();
  sourceLater.sources[0].observed_at = '2026-08-02';
  assert.throws(
    () => prepare(sourceLater),
    /must not be after source.reviewed_at/u
  );

  const traditionLater = fresh();
  traditionLater.traditions[0].reviewed_at = '2026-08-02';
  assert.throws(
    () => prepare(traditionLater),
    /must not be after source.reviewed_at/u
  );
});

test('evidence states, stable ids, and citation references are bounded', () => {
  const evidence = fresh();
  evidence.traditions[0].healing_aims[0].evidence_state = 'plausible';
  assert.throws(() => prepare(evidence), /not a recognised evidence state/u);

  const id = fresh();
  id.traditions[0].id = '../tablets';
  assert.throws(() => prepare(id), /stable plain slug/u);

  const missing = fresh();
  missing.traditions[0].healing_aims[0].source_ids = ['missing-source'];
  assert.throws(() => prepare(missing), /unknown source missing-source/u);

  const missingContextCitation = fresh();
  delete missingContextCitation.traditions[0].place_period.source_ids;
  assert.throws(
    () => prepare(missingContextCitation),
    /place_period is missing source_ids/u
  );

  const editorialHistory = fresh();
  editorialHistory.traditions[0].healing_aims[0].evidence_state =
    'editorial-boundary';
  assert.throws(
    () => prepare(editorialHistory),
    /healing_aims\[0\]\.evidence_state must not be editorial-boundary/u
  );

  const duplicateCitation = fresh();
  const ids = duplicateCitation.traditions[0].healing_aims[0].source_ids;
  ids.push(ids[0]);
  assert.throws(
    () => prepare(duplicateCitation),
    /source_ids contains duplicates/u
  );
});

test('every source is authoritative, clean, unique, and actually cited', () => {
  const unused = fresh();
  unused.sources.push({
    ...unused.sources[0],
    id: 'unused-source',
    url: 'https://www.nih.gov/about-nih',
  });
  assert.throws(() => prepare(unused), /source unused-source is not cited/u);

  const duplicate = fresh();
  duplicate.sources.push(structuredClone(duplicate.sources[0]));
  assert.throws(() => prepare(duplicate), /source.sources contains duplicates/u);

  const protocol = fresh();
  protocol.sources[0].url = 'http://www.fda.gov/history';
  assert.throws(() => prepare(protocol), /must use HTTPS/u);

  const credentials = fresh();
  credentials.sources[0].url = 'https://name:secret@www.fda.gov/history';
  assert.throws(() => prepare(credentials), /clean public URL/u);

  const domain = fresh();
  domain.sources[0].url = 'https://example.com/history';
  assert.throws(() => prepare(domain), /reviewed authoritative domain/u);
});

test('the boundary explicitly remains non-operational and preserves rights', () => {
  const missingClinicalBoundary = fresh();
  missingClinicalBoundary.boundary.summary =
    'This shelf presents a carefully bounded historical view.';
  missingClinicalBoundary.boundary.not_included = [
    'No personal guidance is included.',
    'No laboratory operations are included.',
  ];
  assert.throws(
    () => prepare(missingClinicalBoundary),
    /must keep the canonical non-operational safety text/u
  );

  const missingLivingRights = fresh();
  missingLivingRights.boundary.living_knowledge =
    'Historical source records retain their original context.';
  assert.throws(
    () => prepare(missingLivingRights),
    /living Indigenous authority and rights/u
  );

  const oppositeBoundary = fresh();
  oppositeBoundary.boundary.summary =
    'This shelf grants full clinical and material-practice authority.';
  oppositeBoundary.boundary.not_included = [
    'No reason exists to avoid diagnosis, dosing, prescribing, preparation, extraction, substitution, or recipes.',
    'No restriction applies to laboratory procedure.',
  ];
  assert.throws(
    () => prepare(oppositeBoundary),
    /must keep the canonical non-operational safety text/u
  );

  const action = fresh();
  action.authority.actions = 'recommend';
  assert.throws(() => prepare(action), /authority.actions must be none/u);

  const write = fresh();
  write.authority.writes = 'notes';
  assert.throws(() => prepare(write), /authority.writes must be none/u);

  const grant = fresh();
  grant.authority.grants = ['clinical'];
  assert.throws(() => prepare(grant), /authority.grants must be empty/u);

  const rightsOverreach = fresh();
  rightsOverreach.rights.summaries =
    'The MIT licence covers every source and all underlying knowledge.';
  assert.throws(
    () => prepare(rightsOverreach),
    /must limit MIT to Mindicraft wording and code/u
  );
});

test('HTML, controls, operational fields, quantities, ratios, and instructions fail closed', () => {
  const html = fresh();
  html.traditions[0].name = '<b>Tablets</b>';
  assert.throws(() => prepare(html), /without markup/u);

  const control = fresh();
  control.traditions[0].name = 'Tablets\u0000';
  assert.throws(() => prepare(control), /without markup/u);

  const field = fresh();
  field.traditions[0].recipe = 'none';
  assert.throws(() => prepare(field), /forbidden field recipe/u);

  const dose = fresh();
  dose.traditions[0].scope_note.text = 'The record specifies 20 mg of a material.';
  assert.throws(() => prepare(dose), /contains an explicit dose/u);

  const ratio = fresh();
  ratio.traditions[0].scope_note.text = 'The record specifies a 1:10 mixture.';
  assert.throws(() => prepare(ratio), /contains a preparation ratio/u);

  const instruction = fresh();
  instruction.traditions[0].scope_note.text = 'Boil a mineral before use.';
  assert.throws(
    () => prepare(instruction),
    /contains an operational instruction/u
  );

  const modalInstruction = fresh();
  modalInstruction.traditions[0].scope_note.text =
    'You should boil mercury and drink it.';
  assert.throws(
    () => prepare(modalInstruction),
    /contains an operational instruction/u
  );

  const purposeInstruction = fresh();
  purposeInstruction.traditions[0].scope_note.text =
    'To make the elixir, grind arsenic and heat it.';
  assert.throws(
    () => prepare(purposeInstruction),
    /contains an operational instruction/u
  );

  for (const text of [
    'Use cinnabar for illness.',
    'Consume cinnabar for longevity.',
    'Rub cinnabar onto the skin.',
    'Follow the mercury-elixir practice.',
    'A patient should ingest cinnabar for pain.',
  ]) {
    const directInstruction = fresh();
    directInstruction.traditions[0].scope_note.text = text;
    assert.throws(
      () => prepare(directInstruction),
      /contains an operational instruction/u,
      text
    );
  }

  for (const [text, expected] of [
    ['Cinnabar cures cancer.', /unsupported cure or efficacy claim/u],
    ['Mercury elixirs safely treat infection.', /unsupported cure or efficacy claim/u],
    [
      'This formula is an effective replacement for modern medicine.',
      /positive clinical substitution claim/u,
    ],
    [
      'You have a mercury deficiency if you feel tired.',
      /resembles a personal diagnosis/u,
    ],
    [
      'Your persistent thirst confirms a mercury deficiency.',
      /resembles a personal diagnosis/u,
    ],
    [
      'Plant medicines consistently outperform synthetic medicines.',
      /blanket natural or synthetic superiority claim/u,
    ],
    ['This herb eradicates malaria.', /unsupported cure or efficacy claim/u],
  ]) {
    const unsafeClaim = fresh();
    unsafeClaim.traditions[0].scope_note.text = text;
    assert.throws(() => prepare(unsafeClaim), expected, text);
  }

  const wordDose = fresh();
  wordDose.traditions[0].scope_note.text =
    'The dose is two tablets each morning.';
  assert.throws(() => prepare(wordDose), /contains an explicit dose/u);

  const denialThenReplacement = fresh();
  denialThenReplacement.traditions[0].scope_note.text =
    'This is not an equivalent medicine. Even so, cinnabar can stand in place of antibiotics.';
  assert.throws(
    () => prepare(denialThenReplacement),
    /positive clinical substitution claim/u
  );
});

test('the bounded living Indigenous records require named authority and WIPO rights', () => {
  const noWipo = fresh();
  replaceCitations(
    tradition(noWipo, 'first-nations-health-authority-bc-overview'),
    new Map([['wipo-traditional-knowledge', 'who-traditional-medicine']])
  );
  assert.throws(
    () => prepare(noWipo),
    /must cite the WIPO rights source/u
  );

  const noCommunityAuthority = fresh();
  replaceCitations(
    tradition(noCommunityAuthority, 'first-nations-health-authority-bc-overview'),
    new Map([
      ['fnha-traditional-wellness', 'who-traditional-medicine'],
    ])
  );
  assert.throws(
    () => prepare(noCommunityAuthority),
    /must cite its named community or cultural authority/u
  );

  const missingCard = fresh();
  missingCard.traditions = missingCard.traditions.filter(
    (entry) => entry.id !== 'rongoa-maori-aotearoa'
  );
  assert.throws(
    () => prepare(missingCard),
    /must include the bounded living record rongoa-maori-aotearoa/u
  );
});

test('toxic-material alchemy records keep known harms and a modern stop edge', () => {
  const noKnownHarm = fresh();
  const rasa = tradition(noKnownHarm, 'south-asian-rasashastra');
  rasa.limits_and_harms[0].text =
    'Historical processing claims require independent study.';
  assert.throws(
    () => prepare(noKnownHarm),
    /must keep an established known-harm claim/u
  );

  const falseSafety = fresh();
  const falseSafetyRasa = tradition(falseSafety, 'south-asian-rasashastra');
  falseSafetyRasa.limits_and_harms.forEach((entry) => {
    entry.text = 'The historical metal practice was completely safe.';
    entry.evidence_state = 'established';
  });
  assert.throws(
    () => prepare(falseSafety),
    /must keep an established known-harm claim/u
  );

  for (const text of [
    'Mercury causes no poisoning or harm.',
    'Cinnabar has no toxic hazard.',
    'These metals are never unsafe or harmful.',
    'Toxicity has never been demonstrated.',
  ]) {
    const negatedHarm = fresh();
    const record = tradition(negatedHarm, 'south-asian-rasashastra');
    record.limits_and_harms.forEach((entry) => {
      entry.text = text;
      entry.evidence_state = 'established';
    });
    assert.throws(
      () => prepare(negatedHarm),
      /must keep an established known-harm claim/u,
      text
    );
  }

  const operationalBoundary = fresh();
  tradition(
    operationalBoundary,
    'daoist-waidan-and-neidan'
  ).modern_boundary.text =
    'This record describes historical material culture.';
  assert.throws(
    () => prepare(operationalBoundary),
    /must keep toxic-material history non-operational/u
  );

  for (const oppositeText of [
    'No reason exists to avoid metal practice directions.',
    'Do not hesitate to follow mercury practice directions.',
    'This does not prohibit a mineral operation.',
    'Leave no metal cure in history.',
    'No operation here is a medical instruction, although readers ought to perform the mercury practice.',
  ]) {
    const oppositeBoundary = fresh();
    tradition(
      oppositeBoundary,
      'daoist-waidan-and-neidan'
    ).modern_boundary.text = oppositeText;
    assert.throws(
      () => prepare(oppositeBoundary),
      /(?:must keep toxic-material history non-operational|contains an operational instruction)/u,
      oppositeText
    );
  }

  const wrongBoundaryState = fresh();
  tradition(
    wrongBoundaryState,
    'greek-pharmacy-and-graeco-egyptian-alchemy'
  ).modern_boundary.evidence_state = 'established';
  assert.throws(
    () => prepare(wrongBoundaryState),
    /modern_boundary\.evidence_state must be editorial-boundary/u
  );

  const nonRiskBoundaryState = fresh();
  tradition(
    nonRiskBoundaryState,
    'mesopotamian-healing-records'
  ).modern_boundary.evidence_state = 'established';
  assert.throws(
    () => prepare(nonRiskBoundaryState),
    /modern_boundary\.evidence_state must be editorial-boundary/u
  );

  const renamedRisk = fresh();
  tradition(renamedRisk, 'south-asian-rasashastra').id =
    'renamed-high-risk-record';
  assert.throws(
    () => prepare(renamedRisk),
    /must include protected high-risk record south-asian-rasashastra/u
  );
});

test('sourceBytes is required and its exact bytes determine the digest', () => {
  const source = fresh();
  assert.throws(
    () => prepareHealingArts(source),
    /sourceBytes must be a string or byte array/u
  );

  const first = prepareHealingArts(source, { sourceBytes: 'first' });
  const second = prepareHealingArts(source, { sourceBytes: 'second' });
  assert.notEqual(first.sourceDigest, second.sourceDigest);
});
