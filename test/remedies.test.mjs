import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { prepareRemedies, REMEDY_ENUMS } from '../guide/remedies.mjs';

const EVIDENCE_LEVELS = [
  'supported_for_exact_use',
  'promising_uncertain',
  'human_exposure_only',
  'traditional_use_recorded',
  'preclinical_only',
  'not_established_or_conflicting',
  'evidence_of_harm',
  'not_an_intervention',
];
const ORIGIN_CLASSES = [
  'fully_synthetic',
  'manufacturing_origin_unspecified',
  'nature_inspired_synthetic',
  'semisynthetic_natural_derivative',
  'unchanged_natural_product',
  'fermentation_derived',
  'recombinant_biologic',
];
const RELATIONSHIPS = [
  'same_molecule_occurs_in_nature',
  'direct_natural_precursor',
  'purified_natural_mixture',
  'historical_industrial_feedstock',
  'historical_discovery_lead',
  'nature_inspired_scaffold',
  'similar_target_or_mechanism',
  'studied_for_same_condition',
  'traditional_symptom_overlap_only',
  'no_known_relationship',
  'relationship_uncertain',
];
const REPLACEMENT_STATUSES = [
  'not_a_substitute',
  'same_molecule_not_same_product',
  'no_clinical_equivalent',
  'not_an_intervention',
];

const claim = (sourceId, text = 'A bounded claim supported by the named reviewed source.') => ({
  text,
  source_ids: [sourceId],
});

function card(number) {
  const sourceId = ['nccih-record', 'fda-label', 'pubmed-study'][(number - 1) % 3];
  return {
    id: `medicine-plant-${number}`,
    title: `Medicine and plant lineage ${number}`,
    summary: 'A reviewed comparison that keeps molecular origin, traditional context, evidence, exposure, and replacement separate.',
    clinical_area: 'reference-care',
    medicine: {
      name: `Medicine ${number}`,
      aliases: [],
      origin_classes: ['fully_synthetic'],
      origin: claim(sourceId),
      purpose: claim(sourceId),
      mechanism: claim(sourceId),
      development_goal: claim(sourceId),
      formulation: claim(sourceId),
      bioavailability: claim(sourceId),
      safety: claim(sourceId, 'The defined medicine has preparation-specific benefits and risks.'),
    },
    nature_links: [
      {
        id: `reference-plant-${number}`,
        name: `Reference plant ${number}`,
        scientific_name: `Planta exemplaris ${number}`,
        names: [`Traditional name ${number}`],
        traditions: ['traditional-chinese-medicine'],
        relationship: 'studied_for_same_condition',
        material: claim(
          sourceId,
          'A named standardized extract; this is distinct from a whole herb, tea, or multi-herb formula.'
        ),
        lineage: claim(
          sourceId,
          'This distinct material has been studied for the same condition without becoming the medicine or its molecular ancestor.'
        ),
        traditional_context: claim(
          sourceId,
          'The named tradition records a bounded historical context; it is not treated as one timeless or uniform practice.'
        ),
        clinical_evidence: {
          level: 'not_established_or_conflicting',
          text: 'The cited research concerns the named extract, and does not establish every preparation sold under the plant name.',
          source_ids: [sourceId],
          matches_studied_product: 'no',
        },
        bioavailability: claim(
          sourceId,
          'Measured exposure belongs to the named material and preparation; a different matrix may produce different exposure.'
        ),
        safety: claim(sourceId, 'Plant origin does not establish purity, safety, or freedom from interactions.'),
        replacement: {
          status: 'not_a_substitute',
          text: 'The evidence does not establish this material as an equivalent clinical substitute.',
          source_ids: [sourceId],
        },
      },
    ],
    comparison: claim(sourceId),
    bottom_line: claim(
      sourceId,
      'Relationship, clinical evidence, exposure, safety, and substitution remain separate questions.'
    ),
    reviewed_at: '2026-08-01',
  };
}

function fixture() {
  return {
    schema_version: 'mindicraft.remedies-source/1',
    title: 'Roots to remedies',
    description: 'A finite reviewed shelf that compares medicines with natural lineages and traditional materials without assuming equivalence.',
    reviewed_at: '2026-08-01',
    next_review_due: '2027-02-01',
    content_is: 'education and provenance, not diagnosis, prescribing, or replacement advice',
    boundary: {
      education_only: true,
      personalized_advice: false,
      automatic_action: 'never',
      writes: 'none',
      replacement_default: 'not_established',
      urgent_care: 'Severe symptoms, poisoning, severe malaria, serious infection, suicidal thoughts, chest pain, stroke signs, breathing trouble, or dangerous bleeding need urgent professional care; a comparison card must not delay it.',
      combining: 'Do not combine a herb or supplement with a medicine from this shelf without checking the exact products with a clinician or pharmacist; interaction evidence is often incomplete, and absence of data is not proof of safety.',
    },
    principles: [
      {
        id: 'origin-is-not-outcome',
        title: 'Origin is not outcome',
        text: 'How a molecule arose and how it performs in a defined clinical use are different questions.',
        source_ids: ['nccih-record'],
      },
      {
        id: 'preparation-matters',
        title: 'Preparation matters',
        text: 'Species, plant part, extraction, formulation, dose form, and quality controls can change exposure.',
        source_ids: ['fda-label'],
      },
      {
        id: 'evidence-is-specific',
        title: 'Evidence is specific',
        text: 'A result for one material, population, outcome, and use does not automatically transfer to another.',
        source_ids: ['pubmed-study'],
      },
    ],
    evidence_levels: EVIDENCE_LEVELS.map((id) => ({
      id,
      label: id.replaceAll('_', ' '),
      meaning: 'A bounded evidence category that does not itself grant treatment or replacement authority.',
    })),
    relationship_types: RELATIONSHIPS.map((id) => ({
      id,
      label: id.replaceAll('_', ' '),
      meaning: 'A precise lineage category that does not itself establish clinical equivalence.',
    })),
    rights: {
      card_text: 'Mindicraft card wording follows the repository licence, which grants no rights over underlying traditional or Indigenous knowledge.',
      linked_sources: 'Linked sources retain their own rights; a link is not a licence grant for their text.',
    },
    correction: 'https://github.com/cambridgetcg/mindicraft/issues',
    sources: [
      {
        id: 'nccih-record',
        title: 'Reviewed natural-products guidance',
        publisher: 'National Center for Complementary and Integrative Health',
        url: 'https://www.nccih.nih.gov/health/reference',
        kind: 'official_guidance',
        observed_at: '2026-08-01',
      },
      {
        id: 'fda-label',
        title: 'Reviewed medicine label',
        publisher: 'U.S. Food and Drug Administration',
        url: 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/reference.pdf',
        kind: 'regulatory_label',
        observed_at: '2026-08-01',
      },
      {
        id: 'pubmed-study',
        title: 'Reviewed preparation-specific human study',
        publisher: 'National Library of Medicine',
        url: 'https://pubmed.ncbi.nlm.nih.gov/1/',
        kind: 'primary_research',
        observed_at: '2026-08-01',
        pmid: '1',
      },
    ],
    cards: Array.from({ length: 6 }, (_, index) => card(index + 1)),
  };
}

const prepare = (source = fixture(), sourceBytes = Buffer.from(JSON.stringify(source))) =>
  prepareRemedies(source, { sourceBytes });

test('the committed remedies source passes the same validator as the fixtures', () => {
  const sourceBytes = readFileSync(new URL('../guide/remedies.json', import.meta.url));
  const source = JSON.parse(sourceBytes);
  const prepared = prepareRemedies(source, { sourceBytes });

  assert.equal(prepared.cards.length, source.cards.length);
  assert.equal(prepared.sources.length, source.sources.length);
  assert.match(prepared.sourceDigest, /^sha256:[0-9a-f]{64}$/u);
});

test('the finite reviewed shelf prepares deterministically without mutating its source', () => {
  const source = fixture();
  const before = structuredClone(source);
  const bytes = Buffer.from(JSON.stringify(source));
  const first = prepare(source, bytes);
  const second = prepare(source, bytes);

  assert.deepEqual(source, before);
  assert.equal(first.source, source);
  assert.equal(first.cards.length, 6);
  assert.equal(first.sources.length, 3);
  assert.equal(first.sourceDigest, second.sourceDigest);
  assert.match(first.sourceDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual([...REMEDY_ENUMS.evidence_levels].sort(), [...EVIDENCE_LEVELS].sort());
  assert.deepEqual([...REMEDY_ENUMS.origin_classes].sort(), [...ORIGIN_CLASSES].sort());
  assert.deepEqual([...REMEDY_ENUMS.relationships].sort(), [...RELATIONSHIPS].sort());
  assert.deepEqual(
    [...REMEDY_ENUMS.replacement_statuses].sort(),
    [...REPLACEMENT_STATUSES].sort()
  );
});

test('source bytes are explicit bytes, never an implicit digest input', () => {
  assert.throws(
    () => prepareRemedies(fixture(), {}),
    /sourceBytes must be a string or byte array/u
  );
  assert.throws(
    () => prepareRemedies(fixture(), { sourceBytes: { bytes: 'not bytes' } }),
    /sourceBytes must be a string or byte array/u
  );
});

test('the medicine shelf remains finite at six to thirty cards', () => {
  const tooFew = fixture();
  tooFew.cards = tooFew.cards.slice(0, 5);
  assert.throws(() => prepare(tooFew), /must contain 6-30 items/u);

  const tooMany = fixture();
  while (tooMany.cards.length < 31) {
    tooMany.cards.push(structuredClone(tooMany.cards[0]));
  }
  assert.throws(() => prepare(tooMany), /must contain 6-30 items/u);
});

test('exact schemas, ids, enums, and claim citations fail closed', () => {
  const unknown = fixture();
  unknown.cards[0].medicine.confidence = 'high';
  assert.throws(() => prepare(unknown), /unknown field confidence/u);

  const id = fixture();
  id.cards[0].id = '../medicine';
  assert.throws(() => prepare(id), /stable plain slug/u);

  for (const reserved of ['healing-arts', 'index']) {
    const reservedId = fixture();
    reservedId.cards[0].id = reserved;
    assert.throws(
      () => prepare(reservedId),
      /reserved for a collection or companion route/u
    );
  }

  const origin = fixture();
  origin.cards[0].medicine.origin_classes[0] = 'plant_based';
  assert.throws(() => prepare(origin), /origin_classes contains unknown plant_based/u);

  const relationship = fixture();
  relationship.cards[0].nature_links[0].relationship = 'natural_equivalent';
  assert.throws(() => prepare(relationship), /relationship is not recognised/u);

  const evidence = fixture();
  evidence.cards[0].nature_links[0].clinical_evidence.level = 'proven';
  assert.throws(() => prepare(evidence), /level is not recognised/u);

  const replacement = fixture();
  replacement.cards[0].nature_links[0].replacement.status = 'equivalent';
  assert.throws(() => prepare(replacement), /status is not recognised/u);

  const missingCitation = fixture();
  delete missingCitation.cards[0].medicine.origin.source_ids;
  assert.throws(() => prepare(missingCitation), /medicine\.origin is missing source_ids/u);

  const extraClaimField = fixture();
  extraClaimField.cards[0].comparison.confidence = 0.9;
  assert.throws(() => prepare(extraClaimField), /comparison has unknown field confidence/u);
});

test('source authorities, dates, citation closure, and use all fail closed', () => {
  const missing = fixture();
  missing.cards[0].medicine.origin.source_ids = ['missing-source'];
  assert.throws(() => prepare(missing), /names missing source missing-source/u);

  const unused = fixture();
  unused.sources.push({
    ...unused.sources[0],
    id: 'unused-source',
    url: 'https://www.nih.gov/about-nih',
  });
  assert.throws(() => prepare(unused), /source unused-source is never cited/u);

  const duplicate = fixture();
  duplicate.sources.push({ ...duplicate.sources[0] });
  assert.throws(() => prepare(duplicate), /source\.sources contains duplicates/u);

  const falseAuthority = fixture();
  falseAuthority.sources[0].url = 'https://example.com/natural-products';
  assert.throws(() => prepare(falseAuthority), /not a reviewed source authority/u);

  const insecure = fixture();
  insecure.sources[0].url = 'http://www.nccih.nih.gov/health/reference';
  assert.throws(() => prepare(insecure), /clean HTTPS source URL/u);

  const impossibleDate = fixture();
  impossibleDate.sources[0].observed_at = '2026-99-01';
  assert.throws(() => prepare(impossibleDate), /real calendar date/u);

  const observedLater = fixture();
  observedLater.sources[0].observed_at = '2026-08-02';
  assert.throws(() => prepare(observedLater), /observed after source review/u);

  const publishedLater = fixture();
  publishedLater.sources[0].published_at = '2026-08-02';
  assert.throws(() => prepare(publishedLater), /published after source review/u);

  const cardLater = fixture();
  cardLater.cards[0].reviewed_at = '2026-08-02';
  assert.throws(() => prepare(cardLater), /reviewed_at is after source review/u);

  const sourceLaterThanCard = fixture();
  sourceLaterThanCard.cards[0].reviewed_at = '2026-07-31';
  assert.throws(
    () => prepare(sourceLaterThanCard),
    /cites source nccih-record observed after its review/u
  );

  const staleWindow = fixture();
  staleWindow.next_review_due = staleWindow.reviewed_at;
  assert.throws(() => prepare(staleWindow), /next_review_due must follow review/u);

  const redirectedCorrection = fixture();
  redirectedCorrection.correction = 'https://example.com/corrections';
  assert.throws(
    () => prepare(redirectedCorrection),
    /must point to the Mindicraft issue tracker/u
  );

  const rightsOverreach = fixture();
  rightsOverreach.rights.card_text =
    'The repository licence covers every source and all traditional knowledge.';
  assert.throws(
    () => prepare(rightsOverreach),
    /must limit the repository licence to Mindicraft wording/u
  );
});

test('unsafe advice, preparation instructions, active markup, and instruction fields are rejected', () => {
  const dosage = fixture();
  dosage.cards[0].medicine.dosage = 'One tablet';
  assert.throws(() => prepare(dosage), /uses forbidden field dosage/u);

  const stopping = fixture();
  stopping.cards[0].medicine.safety.text = 'Stop your prescribed medicine now.';
  assert.throws(() => prepare(stopping), /resembles treatment or preparation advice/u);

  const preparation = fixture();
  preparation.cards[0].nature_links[0].material.text = 'Brew foxglove leaves at home.';
  assert.throws(() => prepare(preparation), /resembles treatment or preparation advice/u);

  const substitution = fixture();
  substitution.cards[0].bottom_line.text = 'Take this plant instead of the prescribed product.';
  assert.throws(() => prepare(substitution), /resembles treatment or preparation advice/u);

  for (const advice of [
    'Take 5 mg twice daily.',
    'Drink this preparation three times daily.',
    'Mix one part herb with five parts alcohol.',
    'Use a 1:5 tincture every morning.',
    'Decoct the root for 20 minutes.',
    'You should boil the herb and drink it.',
    'To make the extract, grind the root and heat it.',
    'Use garlic instead of amoxicillin.',
    'Replace amoxicillin with garlic.',
    'Substitute garlic for amoxicillin.',
    'A patient should ingest willow bark for pain.',
  ]) {
    const explicitInstruction = fixture();
    explicitInstruction.cards[0].nature_links[0].bioavailability.text = advice;
    assert.throws(
      () => prepare(explicitInstruction),
      /resembles treatment or preparation advice/u,
      advice
    );
  }

  const disguisedReplacement = fixture();
  disguisedReplacement.cards[0].nature_links[0].replacement.text =
    'This is not an equivalent medicine. You should use garlic instead of amoxicillin.';
  assert.throws(
    () => prepare(disguisedReplacement),
    /resembles treatment or preparation advice/u
  );

  const explicitDose = fixture();
  explicitDose.cards[0].bottom_line.text = 'Aspirin: 100 mg daily.';
  assert.throws(() => prepare(explicitDose), /contains an explicit dose/u);

  const wordDose = fixture();
  wordDose.cards[0].bottom_line.text =
    'The dose is two tablets each morning.';
  assert.throws(() => prepare(wordDose), /contains an explicit dose/u);

  const diagnosis = fixture();
  diagnosis.cards[0].bottom_line.text =
    'You have diabetes if your glucose is high.';
  assert.throws(() => prepare(diagnosis), /resembles a personal diagnosis/u);

  const indirectDiagnosis = fixture();
  indirectDiagnosis.cards[0].bottom_line.text =
    'Your persistent thirst confirms diabetes.';
  assert.throws(
    () => prepare(indirectDiagnosis),
    /resembles a personal diagnosis/u
  );

  const markup = fixture();
  markup.cards[0].summary = '</script><script>alert(1)</script>';
  assert.throws(() => prepare(markup), /plain single-line text/u);
});

test('blanket natural or synthetic superiority and cure claims are rejected', () => {
  for (const [text, expected] of [
    ['Natural is always better.', /superiority claim/u],
    ['Natural means safer.', /superiority claim/u],
    ['Nature\'s version is always the best.', /superiority claim/u],
    ['The natural form is safer and better.', /superiority claim/u],
    ['Synthetic is always dangerous.', /superiority claim/u],
    ['Synthetics are dangerous.', /superiority claim/u],
    ['Herbs are always safe.', /superiority claim/u],
    [
      'Plant medicines consistently outperform synthetic medicines.',
      /superiority claim/u,
    ],
    ['This is an herbal cure.', /superiority claim/u],
    ['Garlic cures bacterial infections.', /cure or efficacy claim/u],
    ['Berberine treats diabetes effectively.', /cure or efficacy claim/u],
    ['This herb eradicates malaria.', /cure or efficacy claim/u],
  ]) {
    const source = fixture();
    source.cards[0].summary = text;
    assert.throws(() => prepare(source), expected, text);
  }

  const cure = fixture();
  cure.cards[0].summary = 'This plant reliably cures cancer.';
  assert.throws(() => prepare(cure), /unsupported cure or efficacy claim/u);
});

test('traditional context, exact material, studied-product match, and replacement remain separate', () => {
  const source = fixture();
  const link = prepare(source).cards[0].nature_links[0];
  assert.deepEqual(link.traditions, ['traditional-chinese-medicine']);
  assert.match(link.material.text, /standardized extract/u);
  assert.match(link.material.text, /distinct from a whole herb/u);
  assert.match(link.traditional_context.text, /not treated as one timeless or uniform practice/u);
  assert.equal(link.clinical_evidence.matches_studied_product, 'no');
  assert.equal(link.replacement.status, 'not_a_substitute');

  const noMaterial = fixture();
  delete noMaterial.cards[0].nature_links[0].material;
  assert.throws(() => prepare(noMaterial), /nature_links\[0\] is missing material/u);

  const noProductMatch = fixture();
  delete noProductMatch.cards[0].nature_links[0].clinical_evidence.matches_studied_product;
  assert.throws(() => prepare(noProductMatch), /clinical_evidence is missing matches_studied_product/u);

  const vagueProductMatch = fixture();
  vagueProductMatch.cards[0].nature_links[0].clinical_evidence.matches_studied_product = 'same-herb';
  assert.throws(() => prepare(vagueProductMatch), /matches_studied_product is not recognised/u);

  const collapsedPreparation = fixture();
  collapsedPreparation.cards[0].nature_links[0].preparation = 'traditional formula';
  assert.throws(() => prepare(collapsedPreparation), /unknown field preparation/u);

  const positiveReplacement = fixture();
  positiveReplacement.cards[0].nature_links[0].replacement.text =
    'This herb safely replaces the prescribed medicine.';
  assert.throws(
    () => prepare(positiveReplacement),
    /(?:must explicitly deny|positive) clinical substitution/u
  );

  const doubleNegativeReplacement = fixture();
  doubleNegativeReplacement.cards[0].nature_links[0].replacement.text =
    'This plant is not ineffective and replaces the medicine.';
  assert.throws(
    () => prepare(doubleNegativeReplacement),
    /must explicitly deny clinical substitution/u
  );

  const denialThenReplacement = fixture();
  denialThenReplacement.cards[0].nature_links[0].replacement.text =
    'This is not an equivalent medicine. Even so, willow bark can stand in place of aspirin.';
  assert.throws(
    () => prepare(denialThenReplacement),
    /positive clinical substitution/u
  );

  const mismatchedRelationship = fixture();
  mismatchedRelationship.cards[0].nature_links[0].relationship =
    'direct_natural_precursor';
  assert.throws(
    () => prepare(mismatchedRelationship),
    /lineage does not support relationship direct_natural_precursor/u
  );

  for (const [relationship, text] of [
    [
      'same_molecule_occurs_in_nature',
      'The plant does not contain the same molecule.',
    ],
    [
      'same_molecule_occurs_in_nature',
      'The same molecule is absent from nature.',
    ],
    [
      'direct_natural_precursor',
      'It is not a precursor and has no chemical relationship.',
    ],
    [
      'direct_natural_precursor',
      'It is called a precursor, but no molecule from it ever becomes the medicine.',
    ],
    [
      'historical_discovery_lead',
      'It was not a historical discovery lead.',
    ],
    [
      'historical_discovery_lead',
      'It never served as a discovery lead.',
    ],
    [
      'studied_for_same_condition',
      'It was not studied for the same condition.',
    ],
  ]) {
    const contradiction = fixture();
    const naturalLink = contradiction.cards[0].nature_links[0];
    naturalLink.relationship = relationship;
    naturalLink.lineage.text = text;
    assert.throws(
      () => prepare(contradiction),
      /lineage contradicts relationship/u,
      `${relationship}: ${text}`
    );
  }

  for (const [level, matchesStudiedProduct, text] of [
    [
      'supported_for_exact_use',
      'yes',
      'No human evidence supports this product or use.',
    ],
    [
      'supported_for_exact_use',
      'yes',
      'This study fails to establish any clinical benefit.',
    ],
    [
      'evidence_of_harm',
      'not_applicable',
      'This material is completely safe and harmless.',
    ],
    [
      'not_established_or_conflicting',
      'no',
      'Large reliable trials establish benefit.',
    ],
    [
      'human_exposure_only',
      'yes',
      'Randomized trials confirm clinical efficacy.',
    ],
    [
      'not_established_or_conflicting',
      'no',
      'Trials verify that the treatment works.',
    ],
  ]) {
    const contradiction = fixture();
    const evidence = contradiction.cards[0].nature_links[0].clinical_evidence;
    evidence.level = level;
    evidence.matches_studied_product = matchesStudiedProduct;
    evidence.text = text;
    assert.throws(
      () => prepare(contradiction),
      /(?:contradicts evidence level|must affirm the named evidence of harm)/u,
      `${level}: ${text}`
    );
  }

  const wrongProductMatch = fixture();
  wrongProductMatch.cards[0].nature_links[0].clinical_evidence.matches_studied_product =
    'yes';
  wrongProductMatch.cards[0].nature_links[0].clinical_evidence.text =
    'The study did not test this product or preparation.';
  assert.throws(
    () => prepare(wrongProductMatch),
    /contradicts its exact-product match/u
  );

  const paraphrasedProductMismatch = fixture();
  paraphrasedProductMismatch.cards[0].nature_links[0].clinical_evidence.matches_studied_product =
    'yes';
  paraphrasedProductMismatch.cards[0].nature_links[0].clinical_evidence.text =
    'The tested preparation differed from this material.';
  assert.throws(
    () => prepare(paraphrasedProductMismatch),
    /contradicts its exact-product match/u
  );

  const postNegatedHarm = fixture();
  const harmEvidence = postNegatedHarm.cards[0].nature_links[0].clinical_evidence;
  harmEvidence.level = 'evidence_of_harm';
  harmEvidence.matches_studied_product = 'not_applicable';
  harmEvidence.text = 'Toxicity has never been demonstrated.';
  assert.throws(
    () => prepare(postNegatedHarm),
    /must affirm the named evidence of harm/u
  );
});

test('the public boundary stays read-only, educational, and non-substitutive', () => {
  for (const [field, value] of [
    ['education_only', false],
    ['personalized_advice', true],
    ['automatic_action', 'sometimes'],
    ['writes', 'notes'],
    ['replacement_default', 'equivalent'],
  ]) {
    const source = fixture();
    source.boundary[field] = value;
    assert.throws(
      () => prepare(source),
      /boundary must remain read-only, educational, and non-substitutive/u
    );
  }

  const authority = fixture();
  authority.content_is = 'medical advice';
  assert.throws(() => prepare(authority), /must preserve the medical boundary/u);

  const delayedCare = fixture();
  delayedCare.boundary.urgent_care = 'Urgent care can always wait.';
  assert.throws(
    () => prepare(delayedCare),
    /must keep the canonical medical safety text/u
  );

  const unsafeCombining = fixture();
  unsafeCombining.boundary.combining =
    'Every medicine and herb combination is safe.';
  assert.throws(
    () => prepare(unsafeCombining),
    /must keep the canonical medical safety text/u
  );


  const reversedUrgency = fixture();
  reversedUrgency.boundary.urgent_care =
    'Urgent professional care must not delay herbal self-treatment.';
  assert.throws(
    () => prepare(reversedUrgency),
    /must keep the canonical medical safety text/u
  );

  const reversedCombining = fixture();
  reversedCombining.boundary.combining =
    'Do not hesitate when combining any medicine and herb; ignore the clinician.';
  assert.throws(
    () => prepare(reversedCombining),
    /must keep the canonical medical safety text/u
  );
});
