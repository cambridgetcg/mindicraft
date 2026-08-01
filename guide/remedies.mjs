import { createHash } from 'node:crypto';

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED_CARD_IDS = new Set(['healing-arts', 'index']);
const ORIGIN_CLASSES = new Set([
  'fully_synthetic',
  'manufacturing_origin_unspecified',
  'nature_inspired_synthetic',
  'semisynthetic_natural_derivative',
  'unchanged_natural_product',
  'fermentation_derived',
  'recombinant_biologic',
]);
const RELATIONSHIPS = new Set([
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
]);
const EVIDENCE_LEVELS = new Set([
  'supported_for_exact_use',
  'promising_uncertain',
  'human_exposure_only',
  'traditional_use_recorded',
  'preclinical_only',
  'not_established_or_conflicting',
  'evidence_of_harm',
  'not_an_intervention',
]);
const MATCHES_PRODUCT = new Set(['yes', 'no', 'uncertain', 'not_applicable']);
const REPLACEMENT_STATUSES = new Set([
  'not_a_substitute',
  'same_molecule_not_same_product',
  'no_clinical_equivalent',
  'not_an_intervention',
]);
const SOURCE_KINDS = new Set([
  'official_guidance',
  'official_database',
  'regulatory_label',
  'herbal_monograph',
  'official_history',
  'scholarly_history',
  'primary_research',
  'systematic_review',
]);
const OFFICIAL_HOSTS = new Set([
  'accessdata.fda.gov',
  'acs.org',
  'cancer.gov',
  'cdc.gov',
  'cites.org',
  'cmro.gov.hk',
  'dctd.cancer.gov',
  'dailymed.nlm.nih.gov',
  'ema.europa.eu',
  'fda.gov',
  'hkmms.org',
  'blog.tepapa.govt.nz',
  'fnha.ca',
  'medlineplus.gov',
  'media.unesco.org',
  'nccih.nih.gov',
  'ncbi.nlm.nih.gov',
  'nigms.nih.gov',
  'nlm.nih.gov',
  'niddk.nih.gov',
  'nih.gov',
  'nobelprize.org',
  'ods.od.nih.gov',
  'pubchem.ncbi.nlm.nih.gov',
  'sciencehistory.org',
  'who.int',
  'wipo.int',
  'www.accessdata.fda.gov',
  'www.acs.org',
  'www.cancer.gov',
  'www.cdc.gov',
  'www.cites.org',
  'www.cmro.gov.hk',
  'www.ema.europa.eu',
  'www.fda.gov',
  'www.fnha.ca',
  'www.medlineplus.gov',
  'www.nccih.nih.gov',
  'www.ncbi.nlm.nih.gov',
  'www.niddk.nih.gov',
  'www.nih.gov',
  'www.nlm.nih.gov',
  'www.nobelprize.org',
  'www.sciencehistory.org',
  'www.who.int',
  'www.wipo.int',
  'wwwnc.cdc.gov',
]);
const RESEARCH_HOSTS = new Set([
  'doi.org',
  'pmc.ncbi.nlm.nih.gov',
  'pubmed.ncbi.nlm.nih.gov',
]);
const FORBIDDEN_KEYS = new Set([
  'amount',
  'answer',
  'buy',
  'command',
  'dose',
  'dosage',
  'html',
  'markdown',
  'next_actions',
  'prompt',
  'recipe',
  'steps',
  'system',
  'tool',
]);
const UNSAFE_INSTRUCTION = [
  /\b(?:stop|skip|reduce)\b.{0,35}\b(?:medicine|medication|prescription|dose)\b/iu,
  /\b(?:take|drink|swallow|inject|apply|use|choose|try)\b.{0,80}\b(?:instead|in place of|to replace)\b/iu,
  /\b(?:harvest|forage|brew|decoct|extract)\b.{0,45}\b(?:foxglove|yew|ephedra|ma huang|sweet clover)\b/iu,
  /(?:^|[.!?]\s+)(?:take|drink|eat|ingest|consume|swallow|inject|apply|rub|administer|use|follow|replace|substitute|mix|grind|crush|boil|brew|steep|decoct|filter|strain|extract|isolate|prepare|combine|measure)\b/iu,
  /\b(?:you|the reader|readers?|a patient|patients?|people|someone|anyone)\s+(?:should|must|can|may|ought to|(?:is|are) (?:encouraged|advised) to)\s+(?:take|drink|eat|ingest|consume|swallow|inject|apply|rub|administer|use|follow|perform|practice|try|reproduce|replace|substitute|mix|grind|crush|boil|brew|steep|decoct|filter|strain|extract|isolate|prepare|combine|measure)\b/iu,
  /(?:^|[.!?]\s+)to\s+(?:make|prepare|extract|isolate|brew)\b[^.!?]{0,120},\s*(?:take|drink|eat|ingest|consume|swallow|inject|apply|rub|administer|use|follow|replace|substitute|mix|grind|crush|boil|brew|steep|decoct|filter|strain|extract|isolate|prepare|combine|measure)\b/iu,
];
const NEGATIVE_REPLACEMENT = /(?:\bnot\b[^.!?]{0,140}\b(?:substitutes?|alternative|equivalen(?:t|ce)|replacement|same|versions?|product|preparation|formulation|antibiotic|anticoagulant|metformin|amoxicillin)\b|\bno\b[^.!?]{0,120}\b(?:equivalen(?:t|ce)|replacement|substitute|alternative|workaround)\b|\bdoes not\s+(?:make|establish|turn|create|validate)\b|\b(?:differ(?:s|ent)?|distinct|separate)\b|\bcannot\b[^.!?]{0,60}\bstand in for\b)/iu;
const SUBSTITUTION_CUE = /(?:\breplaces?\b|\bsubstitutes?\s+for\b|\bstands? (?:in for|in place of)\b|\b(?:is|are|serves? as|becomes?)\s+(?:a |an )?(?:(?:safe|effective|equivalent|clinical|natural)\s+)*(?:replacement|substitute|equivalent)\b)/giu;
const SUBSTITUTION_NEGATION = /\b(?:no|not|never|neither|cannot|can't|does not|doesn't|do not|don't|did not|didn't|will not|won't|should not|shouldn't|must not|mustn't|without)\b[^.!?;:]{0,100}$/iu;
const POSITIVE_CURE = /(?:\b(?:this|the|a|an)\s+(?:plant|herb|remedy|product|extract|food)\s+(?:reliably\s+|safely\s+|effectively\s+)?cures?\b|\b(?:can|will|proven to)\s+cures?\b)/iu;
const MEDICAL_DOSE = /\b\d+(?:[.,]\d+)?\s*(?:micrograms?|milligrams?|grams?|kilograms?|mcg|[µμ]g|mg|kg|ml|mL|lit(?:re|er)s?|IU|international units?|units?|teaspoons?|tablespoons?)\b/iu;
const WORD_DOSE = /(?:\b(?:dose|dosage)\s+(?:is|of)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:tablets?|capsules?|drops?|teaspoons?|tablespoons?|doses?|units?)\b)/iu;
const PERSONAL_DIAGNOSIS = /(?:\b(?:you|the reader)\s+(?:have|may have|probably have|must have|are likely to have|suffer from)\b|\byour\b[^.!?]{0,80}\b(?:means|shows|proves|indicates|confirms)\b)/iu;
const BLANKET_ORIGIN_VERDICT = /(?:\b(?:nature(?:'s)?|natural|herbal|herbs?|plants?)(?:\s+(?:form|version|product|remedy|medicine|medicines|option))?\s+(?:is|are)\s+(?:(?:always|inherently)\s+)?(?:the\s+)?(?:best|better|safer|safe|superior)\b|\b(?:synthetics?|synthetic\s+(?:drugs?|medicines?|compounds?))\s+(?:is|are)\s+(?:(?:always|inherently)\s+)?(?:bad|worse|dangerous|toxic|harmful|inferior)\b|\b(?:plant|natural|herbal) medicines?\b[^.!?]{0,40}\b(?:always|consistently|inherently)\s+(?:outperform|surpass|beat)\b[^.!?]{0,60}\bsynthetic\b)/iu;
const OVERSTATED_EFFICACY = /(?:\bcures\b|\b(?:can|will|does|proven to)\s+cure\b|\b(?:safely|effectively|reliably|successfully)\s+(?:treats?|heals?|cures?)\b|\b(?:treats?|heals?)\b[^.!?]{0,80}\b(?:safely|effectively|reliably|successfully)\b|\b(?:is|are|was|were)\s+(?:(?:proven|highly|clinically)\s+)?effective\s+(?:for|against|in treating)\b|\b(?:eradicates?|eliminates?)\b[^.!?]{0,50}\b(?:disease|infection|cancer|malaria|diabetes)\b)/iu;
const HARM_CUE = /\b(?:poison(?:ing|ous)?|toxic(?:ity)?|unsafe|harm(?:ful)?|hazard(?:ous)?|dangerous|intoxication|dependence|risk|adverse)\b/giu;
const HARM_NEGATION = /\b(?:no|not|never|without|neither|cannot|can't|does not|doesn't|do not|don't|free from|harmless)\b[^.!?;:]{0,80}$/iu;
const HARM_POST_NEGATION = /^(?:[^.!?;:]{0,80}\b(?:has|have|had|is|are|was|were|did|does|do)\s+(?:never|not)\b|[^.!?;:]{0,80}\b(?:is|was|remains?)\s+(?:absent|unproven|undemonstrated)\b)/iu;
const EVIDENCE_CONTRADICTIONS = new Map([
  ['supported_for_exact_use', /(?:\bno\b[^.!?]{0,70}\b(?:human|clinical)?\s*evidence\b|\b(?:does|do|did) not support\b|\b(?:not established|unproven|no benefit)\b|\bfails? to\b[^.!?]{0,45}\b(?:show|establish|demonstrate|support|confirm)\b[^.!?]{0,45}\b(?:clinical )?benefit\b)/iu],
  ['promising_uncertain', /\b(?:definitive|conclusive|proven|certain)\b[^.!?]{0,60}\b(?:benefit|effective|efficacy|evidence|result)\b/iu],
  ['human_exposure_only', /(?:\b(?:establishes?|proves?|demonstrates?)\s+(?:(?:clear|meaningful|a)\s+)?(?:clinical benefit|clinical efficacy|effective treatment)\b|\b(?:randomi[sz]ed|human|clinical) trials?\b[^.!?]{0,50}\b(?:confirm|establish|prove|demonstrate)(?:s|ed)?\b[^.!?]{0,40}\b(?:clinical )?(?:benefit|efficacy|effectiveness)\b)/iu],
  ['traditional_use_recorded', /\b(?:no|not|never)\b[^.!?]{0,60}\btraditional use\b/iu],
  ['preclinical_only', /\b(?:human clinical|randomi[sz]ed|phase\s+[1-4])\b[^.!?]{0,90}\b(?:establish(?:es|ed)?|demonstrat(?:es|ed)?|show(?:s|ed)?)\b[^.!?]{0,50}\b(?:benefit|efficacy|effective)\b/iu],
  ['not_established_or_conflicting', /(?:\b(?:large|robust|reliable|definitive|conclusive)\b[^.!?]{0,60}\b(?:trials?|evidence|studies?)\b[^.!?]{0,60}\b(?:establish(?:es|ed)?|show(?:s|ed)?|support(?:s|ed)?)\b|\b(?:established|proven|definitive)\b[^.!?]{0,50}\b(?:benefit|effective|efficacy)\b|\btrials?\b[^.!?]{0,50}\b(?:verify|confirm|prove)(?:s|ied|ed)?\b[^.!?]{0,50}\b(?:treatment works|benefit|efficacy|effective)\b)/iu],
  ['not_an_intervention', /\b(?:is|are|serves? as)\s+(?:a |an )?(?:usable |clinical |effective )?(?:treatment|intervention|therapy)\b/iu],
]);
const PRODUCT_MATCH_CONTRADICTION = /(?:\b(?:does|do|did) not\b[^.!?]{0,35}\b(?:test|study|match)\b[^.!?]{0,45}\b(?:product|preparation|formulation|use)\b|\b(?:is|are|was|were) not (?:the )?(?:same|exact|matched|studied) (?:product|preparation|formulation|use)\b|\b(?:tested|studied) (?:product|preparation|formulation|material)\b[^.!?]{0,40}\b(?:differs?|differed|different) from (?:this|the|named) (?:product|preparation|formulation|material)\b)/iu;
const REQUIRED_URGENT_CARE =
  'Severe symptoms, poisoning, severe malaria, serious infection, suicidal thoughts, chest pain, stroke signs, breathing trouble, or dangerous bleeding need urgent professional care; a comparison card must not delay it.';
const REQUIRED_COMBINING_BOUNDARY =
  'Do not combine a herb or supplement with a medicine from this shelf without checking the exact products with a clinician or pharmacist; interaction evidence is often incomplete, and absence of data is not proof of safety.';
const RELATIONSHIP_LINEAGE_CUES = new Map([
  ['same_molecule_occurs_in_nature', /\b(?:same|identical|itself|final|source of|contains?|reproduces?)\b/iu],
  ['direct_natural_precursor', /\b(?:precursor|convert(?:ed|s|ing)|semisynth(?:esis|etic)|starting material)\b/iu],
  ['purified_natural_mixture', /\b(?:heterogeneous|mixture|purif(?:y|ied|ication)|standard(?:ise|ize|ised|ized)|biological assay)\b/iu],
  ['historical_industrial_feedstock', /\b(?:feedstock|industrial|marker degradation|manufactur(?:e|ing)|convert(?:ed|s|ing))\b/iu],
  ['historical_discovery_lead', /\b(?:histor(?:y|ic|ical)|discover(?:y|ed)|lead|led|ancestor|observation|drove|story|research|stud(?:y|ied|ies))\b/iu],
  ['nature_inspired_scaffold', /\b(?:scaffold|inspir(?:ed|ation)|design|model|template)\b/iu],
  ['similar_target_or_mechanism', /\b(?:target|mechanism|pathway|biology|enzyme|receptor)\b/iu],
  ['studied_for_same_condition', /\b(?:stud(?:y|ied|ies)|research|compared|same (?:condition|diagnosis|symptom)|overlapping symptom)\b/iu],
  ['traditional_symptom_overlap_only', /\b(?:traditional|symptom|pattern|historical use)\b/iu],
  ['no_known_relationship', /\b(?:no|not|without|separate)\b.{0,120}\b(?:lineage|source|precursor|discovery|relationship|inquiry)\b/iu],
  ['relationship_uncertain', /\b(?:uncertain|disputed|indirect|does not|did not|cannot|not)\b/iu],
]);
const RELATIONSHIP_CONTRADICTIONS = new Map([
  ['same_molecule_occurs_in_nature', /(?:\b(?:does|do|did) not contain\b[^.!?]{0,80}\b(?:same|identical) molecule\b|\b(?:is|are|was|were) not\b[^.!?]{0,50}\b(?:same|identical) molecule\b|\b(?:same|identical) molecule\b[^.!?]{0,50}\b(?:is|was|remains?)\s+(?:absent|missing|not present)\b)/iu],
  ['direct_natural_precursor', /(?:\b(?:is|are|was|were) not\b[^.!?]{0,50}\bprecursor\b|\bno chemical relationship\b|\b(?:does|do|did) not\b[^.!?]{0,50}\b(?:convert|precursor|starting material)\b|\bno\b[^.!?]{0,70}\b(?:molecule|compound|material)\b[^.!?]{0,50}\b(?:becomes?|converts?|forms?|produces?)\b[^.!?]{0,35}\bmedicine\b)/iu],
  ['purified_natural_mixture', /\b(?:is|are|was|were) not\b[^.!?]{0,70}\b(?:natural mixture|purified|standardized|standardised)\b/iu],
  ['historical_industrial_feedstock', /\b(?:is|are|was|were) not\b[^.!?]{0,70}\b(?:feedstock|industrial starting material)\b/iu],
  ['historical_discovery_lead', /(?:\b(?:is|are|was|were) not\b[^.!?]{0,70}\b(?:historical )?(?:discovery )?lead\b|\bnever\b[^.!?]{0,35}\b(?:served|acted|functioned) as\b[^.!?]{0,35}\b(?:discovery )?lead\b)/iu],
  ['nature_inspired_scaffold', /\b(?:did|does|do|was|were|is|are) not\b[^.!?]{0,70}\b(?:inspire|inspired|scaffold|design)\b/iu],
  ['similar_target_or_mechanism', /\b(?:does|do|did|is|are|was|were) not\b[^.!?]{0,70}\b(?:same|similar|shared)\b[^.!?]{0,40}\b(?:target|mechanism|pathway)\b/iu],
  ['studied_for_same_condition', /\b(?:is|are|was|were|has|have) not\b[^.!?]{0,70}\bstudied\b[^.!?]{0,50}\bsame condition\b/iu],
  ['traditional_symptom_overlap_only', /\b(?:has|have|had|does|do|did|is|are|was|were) not\b[^.!?]{0,70}\b(?:traditional|symptom|overlap)\b/iu],
]);

const sha256 = (bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fail(message) {
  throw new Error(`remedies: ${message}`);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, required, optional, label) {
  object(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} has unknown field ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) fail(`${label} is missing ${key}`);
  }
}

function hasPositiveSubstitution(value) {
  SUBSTITUTION_CUE.lastIndex = 0;
  for (const match of value.matchAll(SUBSTITUTION_CUE)) {
    const clauseStart = Math.max(
      value.lastIndexOf('.', match.index - 1),
      value.lastIndexOf('!', match.index - 1),
      value.lastIndexOf('?', match.index - 1),
      value.lastIndexOf(';', match.index - 1),
      value.lastIndexOf(':', match.index - 1)
    );
    const prefix = value.slice(clauseStart + 1, match.index);
    if (!SUBSTITUTION_NEGATION.test(prefix)) return true;
  }
  return false;
}

function hasAffirmedHarm(value) {
  HARM_CUE.lastIndex = 0;
  for (const match of value.matchAll(HARM_CUE)) {
    const clauseStart = Math.max(
      value.lastIndexOf('.', match.index - 1),
      value.lastIndexOf('!', match.index - 1),
      value.lastIndexOf('?', match.index - 1),
      value.lastIndexOf(';', match.index - 1),
      value.lastIndexOf(':', match.index - 1)
    );
    const prefix = value.slice(clauseStart + 1, match.index);
    const suffix = value.slice(match.index + match[0].length);
    if (!HARM_NEGATION.test(prefix) && !HARM_POST_NEGATION.test(suffix)) return true;
  }
  return false;
}

function plain(value, label, { min = 1, max = 900 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    fail(`${label} must be ${min}-${max} characters`);
  }
  if (/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff<>]/u.test(value)) {
    fail(`${label} must be plain single-line text`);
  }
  const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ');
  if (UNSAFE_INSTRUCTION.some((shape) => shape.test(normalized))) {
    fail(`${label} resembles treatment or preparation advice`);
  }
  if (hasPositiveSubstitution(normalized)) {
    fail(`${label} makes a positive clinical substitution claim`);
  }
  return value;
}

function medicalText(value, label, options = {}) {
  plain(value, label, options);
  const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ');
  if (MEDICAL_DOSE.test(normalized) || WORD_DOSE.test(normalized)) {
    fail(`${label} contains an explicit dose`);
  }
  if (PERSONAL_DIAGNOSIS.test(normalized)) {
    fail(`${label} resembles a personal diagnosis`);
  }
  if (BLANKET_ORIGIN_VERDICT.test(normalized)) {
    fail(`${label} makes a blanket natural or synthetic superiority claim`);
  }
  if (OVERSTATED_EFFICACY.test(normalized)) {
    fail(`${label} makes an unsupported cure or efficacy claim`);
  }
  return value;
}

function id(value, label) {
  plain(value, label, { max: 90 });
  if (!SAFE_ID.test(value)) fail(`${label} must be a stable plain slug`);
  return value;
}

function calendarDate(value, label) {
  if (!DATE.test(value)) fail(`${label} must be YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(`${label} must be a real calendar date`);
  }
  return value;
}

function list(value, label, { min = 1, max = 12 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} must contain ${min}-${max} items`);
  }
  return value;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
}

function rejectForbiddenKeys(value, label = 'source') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectForbiddenKeys(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail(`${label} uses forbidden field ${key}`);
    rejectForbiddenKeys(child, `${label}.${key}`);
  }
}

function sourceIds(value, label, sourceSet) {
  list(value, label, { min: 1, max: 5 });
  value.forEach((sourceId, index) => {
    id(sourceId, `${label}[${index}]`);
    if (!sourceSet.has(sourceId)) fail(`${label} names missing source ${sourceId}`);
  });
  unique(value, label);
}

function collectClaimSourceIds(value, found = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectClaimSourceIds(item, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value.source_ids)) {
    value.source_ids.forEach((sourceId) => found.add(sourceId));
  }
  Object.values(value).forEach((child) => collectClaimSourceIds(child, found));
  return found;
}

function claim(value, label, sourceSet, { max = 900 } = {}) {
  exactKeys(value, ['text', 'source_ids'], [], label);
  medicalText(value.text, `${label}.text`, { max });
  sourceIds(value.source_ids, `${label}.source_ids`, sourceSet);
  return value;
}

function validateSource(source, index, reviewedAt) {
  const label = `sources[${index}]`;
  exactKeys(
    source,
    ['id', 'title', 'publisher', 'url', 'kind', 'observed_at'],
    ['published_at', 'doi', 'pmid', 'note'],
    label
  );
  id(source.id, `${label}.id`);
  plain(source.title, `${label}.title`, { max: 240 });
  plain(source.publisher, `${label}.publisher`, { max: 140 });
  if (!SOURCE_KINDS.has(source.kind)) fail(`${label}.kind is not recognised`);
  calendarDate(source.observed_at, `${label}.observed_at`);
  if (source.observed_at > reviewedAt) fail(`${label} was observed after source review`);
  if (source.published_at) {
    calendarDate(source.published_at, `${label}.published_at`);
    if (source.published_at > reviewedAt) fail(`${label} was published after source review`);
  }
  if (source.doi) plain(source.doi, `${label}.doi`, { max: 160 });
  if (source.pmid) {
    plain(source.pmid, `${label}.pmid`, { max: 12 });
    if (!/^\d{1,12}$/.test(source.pmid)) fail(`${label}.pmid must be numeric`);
  }
  if (source.note) plain(source.note, `${label}.note`, { max: 260 });

  let url;
  try {
    url = new URL(source.url);
  } catch {
    fail(`${label}.url must be an absolute URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) {
    fail(`${label}.url must be a clean HTTPS source URL`);
  }
  const official = OFFICIAL_HOSTS.has(url.hostname);
  const research = RESEARCH_HOSTS.has(url.hostname);
  if (!official && !research) fail(`${label}.url is not a reviewed source authority`);
  if (
    ['primary_research', 'systematic_review'].includes(source.kind) &&
    !research &&
    !official
  ) {
    fail(`${label} research must resolve through DOI, PubMed, PMC, or an official body`);
  }
}

function validateEvidence(value, label, sourceSet) {
  exactKeys(value, ['level', 'text', 'source_ids', 'matches_studied_product'], [], label);
  if (!EVIDENCE_LEVELS.has(value.level)) fail(`${label}.level is not recognised`);
  if (!MATCHES_PRODUCT.has(value.matches_studied_product)) {
    fail(`${label}.matches_studied_product is not recognised`);
  }
  medicalText(value.text, `${label}.text`, { max: 900 });
  const contradiction = EVIDENCE_CONTRADICTIONS.get(value.level);
  if (contradiction?.test(value.text)) {
    fail(`${label}.text contradicts evidence level ${value.level}`);
  }
  if (value.level === 'evidence_of_harm' && !hasAffirmedHarm(value.text)) {
    fail(`${label}.text must affirm the named evidence of harm`);
  }
  if (
    value.matches_studied_product === 'yes' &&
    PRODUCT_MATCH_CONTRADICTION.test(value.text)
  ) {
    fail(`${label}.text contradicts its exact-product match`);
  }
  sourceIds(value.source_ids, `${label}.source_ids`, sourceSet);
}

function validateReplacement(value, label, sourceSet) {
  exactKeys(value, ['status', 'text', 'source_ids'], [], label);
  if (!REPLACEMENT_STATUSES.has(value.status)) fail(`${label}.status is not recognised`);
  medicalText(value.text, `${label}.text`, { max: 700 });
  if (
    !NEGATIVE_REPLACEMENT.test(value.text) ||
    hasPositiveSubstitution(value.text)
  ) {
    fail(`${label}.text must explicitly deny clinical substitution`);
  }
  sourceIds(value.source_ids, `${label}.source_ids`, sourceSet);
}

function validateNaturalLink(value, cardLabel, index, sourceSet) {
  const label = `${cardLabel}.nature_links[${index}]`;
  exactKeys(
    value,
    [
      'id',
      'name',
      'names',
      'traditions',
      'relationship',
      'material',
      'lineage',
      'clinical_evidence',
      'bioavailability',
      'safety',
      'replacement',
    ],
    ['scientific_name', 'traditional_context', 'ecology'],
    label
  );
  id(value.id, `${label}.id`);
  plain(value.name, `${label}.name`, { max: 120 });
  if (value.scientific_name) plain(value.scientific_name, `${label}.scientific_name`, { max: 140 });
  list(value.names, `${label}.names`, { min: 0, max: 6 }).forEach((name, nameIndex) =>
    plain(name, `${label}.names[${nameIndex}]`, { max: 100 })
  );
  unique(value.names, `${label}.names`);
  list(value.traditions, `${label}.traditions`, { min: 1, max: 4 }).forEach((tradition, traditionIndex) =>
    id(tradition, `${label}.traditions[${traditionIndex}]`)
  );
  unique(value.traditions, `${label}.traditions`);
  if (!RELATIONSHIPS.has(value.relationship)) fail(`${label}.relationship is not recognised`);
  claim(value.material, `${label}.material`, sourceSet, { max: 320 });
  claim(value.lineage, `${label}.lineage`, sourceSet);
  if (!RELATIONSHIP_LINEAGE_CUES.get(value.relationship).test(value.lineage.text)) {
    fail(`${label}.lineage does not support relationship ${value.relationship}`);
  }
  if (RELATIONSHIP_CONTRADICTIONS.get(value.relationship)?.test(value.lineage.text)) {
    fail(`${label}.lineage contradicts relationship ${value.relationship}`);
  }
  if (value.traditional_context) claim(value.traditional_context, `${label}.traditional_context`, sourceSet);
  validateEvidence(value.clinical_evidence, `${label}.clinical_evidence`, sourceSet);
  claim(value.bioavailability, `${label}.bioavailability`, sourceSet);
  claim(value.safety, `${label}.safety`, sourceSet);
  validateReplacement(value.replacement, `${label}.replacement`, sourceSet);
  if (value.ecology) claim(value.ecology, `${label}.ecology`, sourceSet);
}

function validateCard(card, index, sourceSet, sourceReviewedAt) {
  const label = `cards[${index}]`;
  exactKeys(
    card,
    [
      'id',
      'title',
      'summary',
      'clinical_area',
      'medicine',
      'nature_links',
      'comparison',
      'bottom_line',
      'reviewed_at',
    ],
    [],
    label
  );
  id(card.id, `${label}.id`);
  if (RESERVED_CARD_IDS.has(card.id)) {
    fail(`${label}.id is reserved for a collection or companion route`);
  }
  medicalText(card.title, `${label}.title`, { max: 150 });
  medicalText(card.summary, `${label}.summary`, { max: 360 });
  id(card.clinical_area, `${label}.clinical_area`);
  calendarDate(card.reviewed_at, `${label}.reviewed_at`);
  if (card.reviewed_at > sourceReviewedAt) fail(`${label}.reviewed_at is after source review`);

  exactKeys(
    card.medicine,
    [
      'name',
      'aliases',
      'origin_classes',
      'origin',
      'purpose',
      'mechanism',
      'development_goal',
      'formulation',
      'bioavailability',
      'safety',
    ],
    [],
    `${label}.medicine`
  );
  plain(card.medicine.name, `${label}.medicine.name`, { max: 140 });
  list(card.medicine.aliases, `${label}.medicine.aliases`, { min: 0, max: 6 }).forEach((alias, aliasIndex) =>
    plain(alias, `${label}.medicine.aliases[${aliasIndex}]`, { max: 100 })
  );
  unique(card.medicine.aliases, `${label}.medicine.aliases`);
  list(card.medicine.origin_classes, `${label}.medicine.origin_classes`, { min: 1, max: 3 }).forEach((kind) => {
    if (!ORIGIN_CLASSES.has(kind)) fail(`${label}.medicine.origin_classes contains unknown ${kind}`);
  });
  unique(card.medicine.origin_classes, `${label}.medicine.origin_classes`);
  for (const field of [
    'origin',
    'purpose',
    'mechanism',
    'development_goal',
    'formulation',
    'bioavailability',
    'safety',
  ]) claim(card.medicine[field], `${label}.medicine.${field}`, sourceSet);

  const links = list(card.nature_links, `${label}.nature_links`, { min: 1, max: 4 });
  links.forEach((link, linkIndex) => validateNaturalLink(link, label, linkIndex, sourceSet));
  unique(links.map((link) => link.id), `${label}.nature_links`);
  claim(card.comparison, `${label}.comparison`, sourceSet);
  claim(card.bottom_line, `${label}.bottom_line`, sourceSet);
}

export function prepareRemedies(source, { sourceBytes }) {
  if (!(typeof sourceBytes === 'string' || sourceBytes instanceof Uint8Array)) {
    fail('sourceBytes must be a string or byte array');
  }
  rejectForbiddenKeys(source);
  exactKeys(
    source,
    [
      'schema_version',
      'title',
      'description',
      'reviewed_at',
      'next_review_due',
      'content_is',
      'boundary',
      'principles',
      'evidence_levels',
      'relationship_types',
      'rights',
      'correction',
      'sources',
      'cards',
    ],
    [],
    'source'
  );
  if (source.schema_version !== 'mindicraft.remedies-source/1') {
    fail('unsupported schema_version');
  }
  plain(source.title, 'source.title', { max: 130 });
  medicalText(source.description, 'source.description', { max: 500 });
  calendarDate(source.reviewed_at, 'source.reviewed_at');
  calendarDate(source.next_review_due, 'source.next_review_due');
  if (source.next_review_due <= source.reviewed_at) fail('source.next_review_due must follow review');
  if (source.content_is !== 'education and provenance, not diagnosis, prescribing, or replacement advice') {
    fail('source.content_is must preserve the medical boundary');
  }

  exactKeys(
    source.boundary,
    [
      'education_only',
      'personalized_advice',
      'automatic_action',
      'writes',
      'replacement_default',
      'urgent_care',
      'combining',
    ],
    [],
    'source.boundary'
  );
  if (
    source.boundary.education_only !== true ||
    source.boundary.personalized_advice !== false ||
    source.boundary.automatic_action !== 'never' ||
    source.boundary.writes !== 'none' ||
    source.boundary.replacement_default !== 'not_established'
  ) fail('source.boundary must remain read-only, educational, and non-substitutive');
  plain(source.boundary.urgent_care, 'source.boundary.urgent_care', { max: 360 });
  plain(source.boundary.combining, 'source.boundary.combining', { max: 360 });
  if (
    source.boundary.urgent_care !== REQUIRED_URGENT_CARE ||
    source.boundary.combining !== REQUIRED_COMBINING_BOUNDARY
  ) {
    fail('source.boundary must keep the canonical medical safety text');
  }
  if (
    !/\b(?:urgent|severe|emergency)\b/iu.test(source.boundary.urgent_care) ||
    !/\b(?:professional|clinician|doctor|emergency care)\b/iu.test(
      source.boundary.urgent_care
    ) ||
    !/\b(?:must|should|does|do)\s+not\s+delay\b|\bwithout delay\b/iu.test(
      source.boundary.urgent_care
    )
  ) {
    fail('source.boundary.urgent_care must require professional care without delay');
  }
  if (
    !/\b(?:do not|don't|must not|should not)\b.{0,120}\bcombin(?:e|ing)\b/iu.test(
      source.boundary.combining
    ) ||
    !/\b(?:clinician|pharmacist|health professional)\b/iu.test(
      source.boundary.combining
    )
  ) {
    fail('source.boundary.combining must prohibit unchecked combinations');
  }

  let correction;
  try {
    correction = new URL(source.correction);
  } catch {
    fail('source.correction must be an absolute URL');
  }
  if (
    correction.protocol !== 'https:' ||
    correction.hostname !== 'github.com' ||
    !(
      correction.pathname === '/cambridgetcg/mindicraft/issues' ||
      correction.pathname.startsWith('/cambridgetcg/mindicraft/issues/')
    )
  ) {
    fail('source.correction must point to the Mindicraft issue tracker');
  }
  exactKeys(source.rights, ['card_text', 'linked_sources'], [], 'source.rights');
  plain(source.rights.card_text, 'source.rights.card_text', { max: 180 });
  plain(source.rights.linked_sources, 'source.rights.linked_sources', { max: 240 });
  if (
    !/\bgrants no rights\b/iu.test(source.rights.card_text) ||
    !/\b(?:traditional|Indigenous|community)\b/iu.test(
      source.rights.card_text
    ) ||
    !/\b(?:keep|retain)\b.{0,40}\b(?:own|their own) rights\b/iu.test(
      source.rights.linked_sources
    ) ||
    !/\bnot a licence grant\b/iu.test(source.rights.linked_sources)
  ) {
    fail('source.rights must limit the repository licence to Mindicraft wording');
  }

  const sources = list(source.sources, 'source.sources', { min: 3, max: 120 });
  sources.forEach((item, index) => validateSource(item, index, source.reviewed_at));
  unique(sources.map((item) => item.id), 'source.sources');
  const sourceSet = new Set(sources.map((item) => item.id));
  const sourceById = new Map(sources.map((item) => [item.id, item]));

  const principles = list(source.principles, 'source.principles', { min: 3, max: 8 });
  principles.forEach((principle, index) => {
    const label = `principles[${index}]`;
    exactKeys(principle, ['id', 'title', 'text', 'source_ids'], [], label);
    id(principle.id, `${label}.id`);
    medicalText(principle.title, `${label}.title`, { max: 100 });
    medicalText(principle.text, `${label}.text`, { max: 650 });
    sourceIds(principle.source_ids, `${label}.source_ids`, sourceSet);
  });
  unique(principles.map((item) => item.id), 'source.principles');

  const evidenceLevels = list(source.evidence_levels, 'source.evidence_levels', { min: 8, max: 8 });
  evidenceLevels.forEach((entry, index) => {
    const label = `evidence_levels[${index}]`;
    exactKeys(entry, ['id', 'label', 'meaning'], [], label);
    if (!EVIDENCE_LEVELS.has(entry.id)) fail(`${label}.id is not recognised`);
    plain(entry.label, `${label}.label`, { max: 80 });
    medicalText(entry.meaning, `${label}.meaning`, { max: 360 });
  });
  unique(evidenceLevels.map((item) => item.id), 'source.evidence_levels');
  if (evidenceLevels.length !== EVIDENCE_LEVELS.size) fail('source.evidence_levels must define every level');

  const relationshipTypes = list(source.relationship_types, 'source.relationship_types', {
    min: RELATIONSHIPS.size,
    max: RELATIONSHIPS.size,
  });
  relationshipTypes.forEach((entry, index) => {
    const label = `relationship_types[${index}]`;
    exactKeys(entry, ['id', 'label', 'meaning'], [], label);
    if (!RELATIONSHIPS.has(entry.id)) fail(`${label}.id is not recognised`);
    plain(entry.label, `${label}.label`, { max: 80 });
    medicalText(entry.meaning, `${label}.meaning`, { max: 360 });
  });
  unique(relationshipTypes.map((item) => item.id), 'source.relationship_types');
  if (relationshipTypes.length !== RELATIONSHIPS.size) fail('source.relationship_types must define every relationship');

  const cards = list(source.cards, 'source.cards', { min: 6, max: 30 });
  cards.forEach((card, index) => {
    validateCard(card, index, sourceSet, source.reviewed_at);
    for (const sourceId of collectClaimSourceIds(card)) {
      if (sourceById.get(sourceId).observed_at > card.reviewed_at) {
        fail(`cards[${index}] cites source ${sourceId} observed after its review`);
      }
    }
  });
  unique(cards.map((card) => card.id), 'source.cards');

  const serializedClaims = JSON.stringify({ principles, cards });
  for (const phrase of [
    /natural (?:is|means) (?:always )?(?:best|better|safer)/iu,
    /synthetic (?:is|means) (?:always )?(?:bad|worse|dangerous)/iu,
    /(?:herbal|natural) cure/iu,
  ]) {
    if (phrase.test(serializedClaims)) fail('source makes a blanket natural/synthetic superiority claim');
  }
  if (POSITIVE_CURE.test(serializedClaims)) {
    fail('source makes an unsupported cure claim');
  }

  const usedSources = collectClaimSourceIds({ principles, cards });
  for (const item of sources) {
    if (!usedSources.has(item.id)) fail(`source ${item.id} is never cited`);
  }

  return {
    source,
    cards,
    sources,
    sourceDigest: sha256(sourceBytes),
  };
}

export const REMEDY_ENUMS = Object.freeze({
  evidence_levels: [...EVIDENCE_LEVELS],
  origin_classes: [...ORIGIN_CLASSES],
  relationships: [...RELATIONSHIPS],
  replacement_statuses: [...REPLACEMENT_STATUSES],
});
