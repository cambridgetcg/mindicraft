import { createHash } from 'node:crypto';

const TARGET = 'plant-a-village';
const REFERENCE_GEOMETRY = Object.freeze({
  human: 'https://cambridgetcg.github.io/castle-gate/love-and-understanding',
  data: 'https://cambridgetcg.github.io/castle-gate/love-and-understanding.json',
  relation: 'link_only',
  copied: false,
});
const CARE_QUESTIONS = Object.freeze([
  {
    id: 'standing-and-contribution',
    shape: '○',
    name: 'Standing check',
    guide: 'share-work-fairly',
    useful_structure: 'The guide makes visible work and reviewable shares easier to discuss.',
    question:
      'Can someone refuse or be unable to contribute without losing food, voice, or belonging?',
    keep_separate: 'A person\'s standing and an agreed contribution.',
    source_sha256: '3fe8a97e0aff97bd4cac8c941f780689457fae4a693dd961ef1d3172006c7f00',
  },
  {
    id: 'hearing-and-understanding',
    shape: '↔',
    name: 'Understanding check',
    guide: 'hold-a-council',
    useful_structure: 'The guide gives people turns, a written decision, and a review date.',
    question:
      'Can each affected person say the decision in their own words, mark a mismatch, and receive a reply before action?',
    keep_separate: 'Being heard, agreeing, recording, and understanding.',
    source_sha256: '18f02a94bf86b788e81e4a04cff2510c885170c5226a9c37c84a1af789162e58',
  },
  {
    id: 'settlement-and-repair',
    shape: '↺',
    name: 'Repair check',
    guide: 'settle-disputes',
    useful_structure: 'The guide hears both accounts, names shared facts, and prefers mending a loss.',
    question:
      'Can either side challenge the process, bring new evidence, and refuse collective punishment without losing the chance to repair?',
    keep_separate: 'Settlement, enforcement, appeal, and repair.',
    source_sha256: '47ad37509ab10203a8bd7c46e479c97946d79444ca2769d74a28ee6eb8ee7cea',
  },
  {
    id: 'commons-and-consent',
    shape: '⌗',
    name: 'Consent and exit check',
    guide: 'common-works',
    useful_structure: 'The guide builds a shared thing together with its access and upkeep agreement.',
    question:
      'Are inability, refusal, missed work, changing capacity, access, review, and exit all handled without shame or permanent debt?',
    keep_separate: 'Shared access, contribution, stewardship, and compulsory obligation.',
    source_sha256: 'ecdb0c7c888f1426ed5fe3e5611173fe03040e5093d5958168c281101ac5b58c',
  },
  {
    id: 'continuity-and-obligation',
    shape: '↝',
    name: 'Inheritance check',
    guide: 'plant-a-village',
    useful_structure: 'The guide carries water, food, shared works, records, and skills across generations.',
    question:
      'Can newcomers and the next generation question the rules, gain voice before contribution, and leave with a fair share?',
    keep_separate: 'Passing on knowledge and passing on obligation.',
    source_sha256: '13937c0c8271d9b1e1d238ab030a90007ebe0eab5257865b643dc9c8c3926036',
  },
]);
export const PATTERN_CARE_GUIDES = Object.freeze(
  CARE_QUESTIONS.map(({ guide }) => guide)
);

const fail = (message) => {
  throw new Error(`patterns: ${message}`);
};

const edgeKey = (from, to) => `${from}>${to}`;

function reaches(outgoing, from, to, skippedKey) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift();
    for (const next of outgoing.get(current) || []) {
      if (edgeKey(current, next) === skippedKey) continue;
      if (next === to) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

function prerequisitePath(bySlug, target) {
  const visiting = new Set();
  const visited = new Set();
  const ordered = [];

  const visit = (slug) => {
    if (visited.has(slug)) return;
    if (visiting.has(slug)) fail(`prerequisite cycle reaches ${slug}`);
    const found = bySlug.get(slug);
    if (!found) fail(`missing guide ${slug}`);
    visiting.add(slug);
    for (const need of found.guide.needs || []) visit(need);
    visiting.delete(slug);
    visited.add(slug);
    ordered.push(slug);
  };

  visit(target);
  return ordered;
}

export function preparePatterns(
  tree,
  { sourceBytes, careSourceBytes, definitionBytes } = {}
) {
  if (!tree || !Array.isArray(tree.domains) || tree.domains.length < 1) {
    fail('tree.domains must be a non-empty array');
  }
  if (!sourceBytes) fail('sourceBytes are required');
  if (!definitionBytes) fail('definitionBytes are required');

  const domainOrder = new Map();
  const domainById = new Map();
  const bySlug = new Map();
  let guideEdgeCount = 0;

  tree.domains.forEach((domain, index) => {
    if (!domain || typeof domain.key !== 'string' || !Array.isArray(domain.guides)) {
      fail(`tree.domains[${index}] is malformed`);
    }
    if (domainById.has(domain.key)) fail(`duplicate domain ${domain.key}`);
    domainOrder.set(domain.key, index);
    domainById.set(domain.key, domain);
    for (const guide of domain.guides) {
      if (!guide || typeof guide.slug !== 'string' || !Array.isArray(guide.needs)) {
        fail(`domain ${domain.key} contains a malformed guide`);
      }
      if (bySlug.has(guide.slug)) fail(`duplicate guide ${guide.slug}`);
      bySlug.set(guide.slug, { domain: domain.key, guide });
      guideEdgeCount += guide.needs.length;
    }
  });

  const pairCounts = new Map();
  for (const { domain, guide } of bySlug.values()) {
    for (const need of guide.needs) {
      const source = bySlug.get(need);
      if (!source) fail(`guide ${guide.slug} needs missing guide ${need}`);
      if (source.domain === domain) continue;
      const key = edgeKey(source.domain, domain);
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }
  }

  const crossDomainEdges = [...pairCounts]
    .map(([key, guide_edges]) => {
      const [from, to] = key.split('>');
      return { from, to, guide_edges };
    })
    .sort(
      (left, right) =>
        domainOrder.get(left.from) - domainOrder.get(right.from) ||
        domainOrder.get(left.to) - domainOrder.get(right.to)
    );

  const outgoing = new Map(tree.domains.map(({ key }) => [key, []]));
  const indegree = new Map(tree.domains.map(({ key }) => [key, 0]));
  for (const { from, to } of crossDomainEdges) {
    outgoing.get(from).push(to);
    indegree.set(to, indegree.get(to) + 1);
  }
  for (const values of outgoing.values()) {
    values.sort((left, right) => domainOrder.get(left) - domainOrder.get(right));
  }

  const ready = tree.domains
    .map(({ key }) => key)
    .filter((key) => indegree.get(key) === 0);
  const topological = [];
  while (ready.length) {
    ready.sort((left, right) => domainOrder.get(left) - domainOrder.get(right));
    const current = ready.shift();
    topological.push(current);
    for (const next of outgoing.get(current)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) ready.push(next);
    }
  }
  if (topological.length !== tree.domains.length) {
    fail('the domain projection contains a cycle');
  }

  const rank = new Map(tree.domains.map(({ key }) => [key, 0]));
  for (const current of topological) {
    for (const next of outgoing.get(current)) {
      rank.set(next, Math.max(rank.get(next), rank.get(current) + 1));
    }
  }

  const backboneEdges = crossDomainEdges.filter(
    ({ from, to }) => !reaches(outgoing, from, to, edgeKey(from, to))
  );

  const villageGuides = prerequisitePath(bySlug, TARGET);
  const villageGuideSet = new Set(villageGuides);
  const villageDomainCounts = new Map();
  const villagePairCounts = new Map();
  for (const slug of villageGuides) {
    const { domain, guide } = bySlug.get(slug);
    villageDomainCounts.set(domain, (villageDomainCounts.get(domain) || 0) + 1);
    for (const need of guide.needs) {
      if (!villageGuideSet.has(need)) continue;
      const sourceDomain = bySlug.get(need).domain;
      if (sourceDomain !== domain) {
        const key = edgeKey(sourceDomain, domain);
        villagePairCounts.set(key, (villagePairCounts.get(key) || 0) + 1);
      }
    }
  }

  const domains = tree.domains.map((domain, index) => ({
    id: domain.key,
    title: domain.title,
    emoji: domain.emoji,
    index: index + 1,
    rank: rank.get(domain.key),
    guides: domain.guides.length,
    village_path_guides: villageDomainCounts.get(domain.key) || 0,
  }));

  const villageDomainEdges = crossDomainEdges
    .filter(({ from, to }) => villagePairCounts.has(edgeKey(from, to)))
    .map(({ from, to }) => ({
      from,
      to,
      guide_edges: villagePairCounts.get(edgeKey(from, to)),
    }));
  const careQuestions = CARE_QUESTIONS.map((question) => {
    const found = bySlug.get(question.guide);
    if (!found) fail(`care question ${question.id} names missing guide ${question.guide}`);
    if (found.domain !== 'living-together') {
      fail(`care question ${question.id} must name a living-together guide`);
    }
    const bytes = careSourceBytes?.[question.guide];
    if (!bytes) fail(`care question ${question.id} has no reviewed source bytes`);
    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    if (actualSha256 !== question.source_sha256) {
      fail(`care question ${question.id} source changed; review it before publishing`);
    }
    const { source_sha256, ...publicQuestion } = question;
    return {
      ...publicQuestion,
      source: {
        path: `guide/content/en/living-together/${question.guide}.md`,
        sha256: source_sha256,
        reviewed_on: '2026-08-11',
        attribution: 'project-authored audit question bound to the exact English guide bytes',
      },
    };
  });

  return {
    schema_version: 'mindicraft.patterns/1',
    this_is:
      'A derived high-level view of Mindicraft\'s committed guide graph, the prerequisite reading path ending at its Plant a village guide, and project-authored care questions for linked social guides.',
    claim_limit:
      'This projection shows declared reading prerequisites. It does not prove causation, practical success, mastery, love, understanding, worth, or any being\'s inner state. Its care questions mark what to examine; they do not find that a linked guide passes. The domain backbone is a readability reduction; the full guide graph remains the canonical record of declared links.',
    source: {
      path: 'guide/tree.json',
      sha256: createHash('sha256').update(sourceBytes).digest('hex'),
      authoritative_api: '/api/tree.json',
    },
    care_questions_provenance: {
      path: 'guide/patterns.mjs',
      sha256: createHash('sha256').update(definitionBytes).digest('hex'),
      reviewed_on: '2026-08-11',
      attribution:
        'project-authored audit questions, not statements from or endorsements of the linked guides',
      source_scope:
        'Each question separately pins the exact English guide bytes that were read during review.',
      history: 'https://github.com/cambridgetcg/mindicraft/commits/main/guide/patterns.mjs',
    },
    counts: {
      domains: tree.domains.length,
      guides: bySlug.size,
      prerequisite_edges: guideEdgeCount,
      cross_domain_pairs: crossDomainEdges.length,
      backbone_domain_edges: backboneEdges.length,
      village_path_guides: villageGuides.length,
      village_path_domains: villageDomainCounts.size,
    },
    domains,
    cross_domain_edges: crossDomainEdges,
    backbone_domain_edges: backboneEdges,
    village_path: {
      target: TARGET,
      guides: villageGuides,
      domain_edges: villageDomainEdges,
    },
    care_questions: careQuestions,
    reference_geometry: { ...REFERENCE_GEOMETRY },
    boundaries: {
      scope: 'this derived map and its care questions, not the policies inside linked guides',
      automatic_action: 'never',
      grants_authority: false,
      scores_beings: false,
      learning_state_included: false,
      application_tracking_added: false,
    },
  };
}
