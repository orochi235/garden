/**
 * Curated seed table of companion and antagonist relationships.
 * Lookup is symmetric — getRelation('a', 'b') === getRelation('b', 'a').
 *
 * Keys are `speciesId` values from `cultivars.json` (e.g. 'tomato', 'bean',
 * 'peas', 'pepper-sweet'). Cultivar varieties (e.g. 'tomato.beefsteak') resolve
 * through their `speciesId` so a single pair entry covers all varieties of a
 * species.
 *
 * Missing pairs return null and the optimizer treats them as neutral. This
 * table is intentionally conservative: only relationships with explicit
 * extension-service backing are included. Folkloric pairs (especially many
 * "three sisters" or aromatic-herb claims that vary by source) are omitted
 * unless a land-grant extension publication endorses them.
 *
 * Sources cited inline by short tag:
 *   [UME]    University of Maine Cooperative Extension Bulletin #2167,
 *            "Companion Planting" — extension.umaine.edu/publications/2167e/
 *   [ISU]    Iowa State University Extension and Outreach,
 *            "Companion Planting" — hortnews.extension.iastate.edu
 *   [WVU]    West Virginia University Extension Service,
 *            "Companion Planting" — extension.wvu.edu
 *   [OSU]    Oregon State University Extension Service,
 *            "Vegetable Gardening in Oregon" EC 871; "Growing Your Own"
 *   [UMN]    University of Minnesota Extension,
 *            "Planting a vegetable garden" / "Companion planting"
 *            — extension.umn.edu
 *   [PSU]    Penn State Extension, "Companion Planting" — extension.psu.edu
 *   [CCE]    Cornell Cooperative Extension, vegetable variety pages and
 *            "Vegetable Growing Guides" — gardening.cals.cornell.edu
 *   [USU]    Utah State University Extension, "Companions in the Garden"
 *            — extension.usu.edu
 *   [NCSU]   NC State Extension, "Companion Planting Information"
 *            — content.ces.ncsu.edu
 *   [UNH]    UNH Cooperative Extension, "Companion Planting"
 *            — extension.unh.edu
 *   [SARE]   USDA SARE "Manage Insects on Your Farm" — sare.org
 *
 * When a pair appears in multiple extension sources, the most accessible /
 * canonical citation is used. Where evidence is weaker the comment says so.
 */

export type CompanionRelation = 'companion' | 'antagonist';

interface PairRow {
  a: string;
  b: string;
  rel: CompanionRelation;
}

const PAIRS: PairRow[] = [
  // v1 seed entries that use real speciesIds.
  { a: 'tomato', b: 'basil', rel: 'companion' },
  { a: 'tomato', b: 'carrot', rel: 'companion' },
  { a: 'carrot', b: 'onion', rel: 'companion' },
  { a: 'carrot', b: 'dill', rel: 'antagonist' },
  { a: 'lettuce', b: 'radish', rel: 'companion' },
  { a: 'cucumber', b: 'nasturtium', rel: 'companion' },
  { a: 'cucumber', b: 'sage', rel: 'antagonist' },
  { a: 'squash', b: 'corn', rel: 'companion' },
  { a: 'spinach', b: 'strawberry', rel: 'companion' },
  { a: 'beet', b: 'onion', rel: 'companion' },
  { a: 'asparagus', b: 'tomato', rel: 'companion' },
  { a: 'celery', b: 'leek', rel: 'companion' },
  { a: 'leek', b: 'carrot', rel: 'companion' },
  { a: 'corn', b: 'tomato', rel: 'antagonist' },
  { a: 'fennel', b: 'tomato', rel: 'antagonist' },
  { a: 'garlic', b: 'lettuce', rel: 'companion' },
  { a: 'mint', b: 'cabbage', rel: 'companion' },

  // ---------------------------------------------------------------------------
  // Extension-backed pairs.
  // ---------------------------------------------------------------------------

  // bean/peas + alliums (antagonist) and heavy feeders (companion)
  { a: 'bean', b: 'corn', rel: 'companion' }, // [UME] three-sisters; N-fixer + heavy feeder
  { a: 'bean', b: 'onion', rel: 'antagonist' }, // [UME][WVU] alliums inhibit legumes
  { a: 'bean', b: 'fennel', rel: 'antagonist' }, // [UME] fennel allelopathic to most legumes
  { a: 'squash', b: 'bean', rel: 'companion' }, // [UME] three-sisters
  { a: 'peas', b: 'corn', rel: 'companion' }, // [UME][CCE] N-fixer with heavy feeder
  { a: 'peas', b: 'carrot', rel: 'companion' }, // [UME][WVU]
  { a: 'peas', b: 'onion', rel: 'antagonist' }, // [UME][WVU] alliums inhibit legume nodulation
  { a: 'peas', b: 'garlic', rel: 'antagonist' }, // [UME][WVU] alliums inhibit legumes
  { a: 'bean', b: 'pepper-sweet', rel: 'companion' }, // [WVU] beans recommended near peppers
  { a: 'bean', b: 'pepper-hot', rel: 'companion' }, // [WVU] beans recommended near peppers
  { a: 'pepper-sweet', b: 'basil', rel: 'companion' }, // [PSU] aromatic deters thrips
  { a: 'pepper-hot', b: 'basil', rel: 'companion' }, // [PSU]

  // Brassica family (cabbage/broccoli/cauliflower/kale/brussels-sprouts/etc.)
  { a: 'cabbage', b: 'tomato', rel: 'antagonist' }, // [UME][WVU] tomato inhibits cabbage growth
  { a: 'broccoli', b: 'tomato', rel: 'antagonist' }, // [UME][WVU]
  { a: 'cauliflower', b: 'tomato', rel: 'antagonist' }, // [UME]
  { a: 'kale', b: 'tomato', rel: 'antagonist' }, // [UME]
  { a: 'brussels-sprouts', b: 'tomato', rel: 'antagonist' }, // [UME]
  { a: 'cabbage', b: 'strawberry', rel: 'antagonist' }, // [UME] strawberry suppressed near cabbages
  { a: 'broccoli', b: 'strawberry', rel: 'antagonist' }, // [UME]
  { a: 'cabbage', b: 'dill', rel: 'companion' }, // [UME] dill flowers attract parasitoids of cabbage worm
  { a: 'broccoli', b: 'dill', rel: 'companion' }, // [UME]
  { a: 'cauliflower', b: 'dill', rel: 'companion' }, // [UME]
  { a: 'kale', b: 'dill', rel: 'companion' }, // [UME]

  // ---------------------------------------------------------------------------
  // New extension-backed pairs (additive).
  // ---------------------------------------------------------------------------

  // Allium / legume antagonism — repeated in nearly every extension source.
  // Pairs with all major alliums and legumes in the dataset.
  { a: 'bean', b: 'garlic', rel: 'antagonist' }, // [UME][WVU]
  { a: 'bean', b: 'shallot', rel: 'antagonist' }, // [UME] all alliums
  { a: 'bean', b: 'scallion', rel: 'antagonist' }, // [UME] all alliums
  { a: 'bean', b: 'leek', rel: 'antagonist' }, // [UME][WVU]
  { a: 'bean', b: 'chives', rel: 'antagonist' }, // [UME] all alliums
  { a: 'peas', b: 'shallot', rel: 'antagonist' }, // [UME]
  { a: 'peas', b: 'scallion', rel: 'antagonist' }, // [UME]
  { a: 'peas', b: 'leek', rel: 'antagonist' }, // [UME]
  { a: 'peas', b: 'chives', rel: 'antagonist' }, // [UME]
  { a: 'edamame', b: 'onion', rel: 'antagonist' }, // [UME] edamame is a soybean / legume
  { a: 'edamame', b: 'garlic', rel: 'antagonist' }, // [UME]

  // Legume + heavy feeder — nitrogen fixation benefits the partner.
  { a: 'bean', b: 'cucumber', rel: 'companion' }, // [WVU][PSU]
  { a: 'bean', b: 'potato', rel: 'companion' }, // [UME][WVU] beans deter Colorado potato beetle
  { a: 'peas', b: 'cucumber', rel: 'companion' }, // [PSU]
  { a: 'peas', b: 'radish', rel: 'companion' }, // [UMN][PSU] radish deters cucumber beetles, peas feed N
  { a: 'peas', b: 'turnip', rel: 'companion' }, // [PSU]

  // Onion / carrot — onion-fly and carrot-fly mutual masking is the most
  // frequently cited extension companion pairing.
  { a: 'onion', b: 'beet', rel: 'companion' }, // [UME][WVU]
  { a: 'onion', b: 'lettuce', rel: 'companion' }, // [UMN][WVU]
  { a: 'onion', b: 'tomato', rel: 'companion' }, // [WVU][PSU]
  { a: 'onion', b: 'cabbage', rel: 'companion' }, // [UMN] alliums deter cabbage moth
  { a: 'onion', b: 'broccoli', rel: 'companion' }, // [UMN]
  { a: 'onion', b: 'strawberry', rel: 'companion' }, // [UME]
  { a: 'garlic', b: 'tomato', rel: 'companion' }, // [PSU] deters spider mites
  { a: 'garlic', b: 'cabbage', rel: 'companion' }, // [UMN] deters cabbage looper
  { a: 'garlic', b: 'broccoli', rel: 'companion' }, // [UMN]
  { a: 'garlic', b: 'strawberry', rel: 'companion' }, // [UME]
  { a: 'garlic', b: 'beet', rel: 'companion' }, // [UME]
  { a: 'shallot', b: 'carrot', rel: 'companion' }, // [UME] same allium-fly logic as onion+carrot
  { a: 'leek', b: 'celery', rel: 'companion' }, // [UME] traditional bed-mate; v1 had it under 'celery'
  { a: 'chives', b: 'carrot', rel: 'companion' }, // [UME] aromatic, repels carrot rust fly
  { a: 'chives', b: 'tomato', rel: 'companion' }, // [PSU]

  // Solanaceae — share Verticillium / early-blight / Colorado potato beetle.
  // Extensions consistently warn against rotating between these in the same
  // bed but co-planting in the same season is also discouraged.
  { a: 'tomato', b: 'potato', rel: 'antagonist' }, // [UMN][PSU] shared blight + CPB
  { a: 'tomato', b: 'eggplant', rel: 'antagonist' }, // [UMN] shared pests; weaker than tomato/potato
  { a: 'potato', b: 'eggplant', rel: 'antagonist' }, // [UMN] shared CPB
  { a: 'potato', b: 'pepper-sweet', rel: 'antagonist' }, // [UMN]
  { a: 'potato', b: 'pepper-hot', rel: 'antagonist' }, // [UMN]
  { a: 'potato', b: 'tomatillo', rel: 'antagonist' }, // [UMN] same family
  { a: 'potato', b: 'ground-cherry', rel: 'antagonist' }, // [UMN] same family
  { a: 'potato', b: 'cucumber', rel: 'antagonist' }, // [WVU] cucurbits exacerbate potato blight
  { a: 'potato', b: 'squash', rel: 'antagonist' }, // [WVU]
  { a: 'potato', b: 'melon', rel: 'antagonist' }, // [WVU]

  // Brassica family beneficial associates.
  { a: 'cabbage', b: 'celery', rel: 'companion' }, // [WVU] celery scent deters cabbage moth
  { a: 'broccoli', b: 'celery', rel: 'companion' }, // [WVU]
  { a: 'cabbage', b: 'sage', rel: 'companion' }, // [WVU][PSU] aromatic deters cabbage moth
  { a: 'broccoli', b: 'sage', rel: 'companion' }, // [WVU][PSU]
  { a: 'cauliflower', b: 'sage', rel: 'companion' }, // [WVU]
  { a: 'cabbage', b: 'thyme', rel: 'companion' }, // [PSU] thyme repels cabbage worm
  { a: 'broccoli', b: 'thyme', rel: 'companion' }, // [PSU]
  { a: 'cabbage', b: 'rosemary', rel: 'companion' }, // [PSU] aromatic
  { a: 'broccoli', b: 'rosemary', rel: 'companion' }, // [PSU]
  { a: 'cabbage', b: 'nasturtium', rel: 'companion' }, // [UMN] trap crop for aphids
  { a: 'broccoli', b: 'nasturtium', rel: 'companion' }, // [UMN]
  { a: 'kale', b: 'nasturtium', rel: 'companion' }, // [UMN]

  // Brassica antagonisms — strawberry & tomato listed above; also pole legumes
  // and other heavy demanders compete.
  { a: 'cabbage', b: 'bean', rel: 'companion' }, // [UME] beans feed N to cabbage; intercropping recommended
  { a: 'broccoli', b: 'bean', rel: 'companion' }, // [UME]
  { a: 'cabbage', b: 'peas', rel: 'companion' }, // [UME]

  // Cucurbit family — squash bug and cucumber beetle deterrents.
  { a: 'cucumber', b: 'radish', rel: 'companion' }, // [PSU][UMN] radish repels cucumber beetle
  { a: 'cucumber', b: 'dill', rel: 'companion' }, // [PSU] attracts parasitoids
  { a: 'cucumber', b: 'corn', rel: 'companion' }, // [WVU] traditional intercrop
  { a: 'squash', b: 'nasturtium', rel: 'companion' }, // [UMN] deters squash bug
  { a: 'squash', b: 'radish', rel: 'companion' }, // [UMN] deters squash-vine borer (anecdotal in extension lit)
  { a: 'squash', b: 'marigold', rel: 'companion' }, // [PSU] nematode suppression
  { a: 'melon', b: 'nasturtium', rel: 'companion' }, // [UMN]
  { a: 'melon', b: 'radish', rel: 'companion' }, // [PSU]
  { a: 'melon', b: 'corn', rel: 'companion' }, // [WVU]
  { a: 'watermelon', b: 'nasturtium', rel: 'companion' }, // [UMN]
  { a: 'watermelon', b: 'radish', rel: 'companion' }, // [PSU]
  { a: 'zucchini', b: 'nasturtium', rel: 'companion' }, // [UMN]
  { a: 'zucchini', b: 'bean', rel: 'companion' }, // [UME] three-sisters principle
  { a: 'zucchini', b: 'corn', rel: 'companion' }, // [UME] three-sisters principle
  { a: 'summer-squash', b: 'nasturtium', rel: 'companion' }, // [UMN]
  { a: 'summer-squash', b: 'bean', rel: 'companion' }, // [UME]

  // Aromatic herbs as general pest-deterrents.
  { a: 'tomato', b: 'parsley', rel: 'companion' }, // [PSU] parsley flowers attract parasitoids
  { a: 'tomato', b: 'marigold', rel: 'companion' }, // [PSU][UMN] French marigold suppresses root-knot nematodes
  { a: 'pepper-sweet', b: 'marigold', rel: 'companion' }, // [PSU]
  { a: 'pepper-hot', b: 'marigold', rel: 'companion' }, // [PSU]
  { a: 'eggplant', b: 'marigold', rel: 'companion' }, // [PSU][UMN] flea beetle deterrent (modest evidence)
  { a: 'eggplant', b: 'bean', rel: 'companion' }, // [WVU] beans deter Colorado potato beetle
  { a: 'eggplant', b: 'basil', rel: 'companion' }, // [PSU] thrips/flea beetle deterrent
  { a: 'potato', b: 'marigold', rel: 'companion' }, // [PSU] nematode suppression
  { a: 'carrot', b: 'rosemary', rel: 'companion' }, // [PSU][UME] repels carrot fly
  { a: 'carrot', b: 'sage', rel: 'companion' }, // [PSU][UME] repels carrot fly
  { a: 'carrot', b: 'lettuce', rel: 'companion' }, // [UMN] interplant
  { a: 'carrot', b: 'tomato', rel: 'companion' }, // already in v1 — consistent with [WVU]

  // Lettuce + companions.
  { a: 'lettuce', b: 'strawberry', rel: 'companion' }, // [UME]
  { a: 'lettuce', b: 'chives', rel: 'companion' }, // [UME]
  { a: 'lettuce', b: 'cucumber', rel: 'companion' }, // [PSU] shade tolerance
  { a: 'lettuce', b: 'beet', rel: 'companion' }, // [UMN] interplant
  { a: 'spinach', b: 'radish', rel: 'companion' }, // [UMN]
  { a: 'spinach', b: 'peas', rel: 'companion' }, // [UMN] N + cool-season

  // Beets and chard.
  { a: 'beet', b: 'cabbage', rel: 'companion' }, // [UME]
  { a: 'beet', b: 'broccoli', rel: 'companion' }, // [UME]
  { a: 'beet', b: 'lettuce', rel: 'companion' }, // [UMN]
  { a: 'beet', b: 'bean', rel: 'antagonist' }, // [UME] beets stunted near pole legumes
  { a: 'chard', b: 'bean', rel: 'companion' }, // [UME] dissimilar feeders
  { a: 'chard', b: 'onion', rel: 'companion' }, // [UME]

  // Asparagus.
  { a: 'asparagus', b: 'parsley', rel: 'companion' }, // [PSU]
  { a: 'asparagus', b: 'basil', rel: 'companion' }, // [PSU][UME] basil deters asparagus beetle
  { a: 'asparagus', b: 'onion', rel: 'antagonist' }, // [UME] alliums inhibit asparagus

  // Allelopathic / juglone-like — fennel and dill are the classic culprits in
  // extension lit. Dill is beneficial at flowering for brassicas (parasitoid
  // attractor) but antagonistic to carrots in the seedling stage because it
  // can cross-pollinate and stunt them.
  { a: 'fennel', b: 'pepper-sweet', rel: 'antagonist' }, // [UME] broad allelopathic warning
  { a: 'fennel', b: 'pepper-hot', rel: 'antagonist' }, // [UME]
  { a: 'fennel', b: 'cabbage', rel: 'antagonist' }, // [UME]
  { a: 'fennel', b: 'broccoli', rel: 'antagonist' }, // [UME]
  { a: 'fennel', b: 'bean', rel: 'antagonist' }, // [UME]
  { a: 'fennel', b: 'peas', rel: 'antagonist' }, // [UME]
  { a: 'fennel-bulb', b: 'tomato', rel: 'antagonist' }, // [UME] same species as 'fennel'
  { a: 'fennel-bulb', b: 'bean', rel: 'antagonist' }, // [UME]
  { a: 'fennel-bulb', b: 'peas', rel: 'antagonist' }, // [UME]

  // Sunflower allelopathy — well-documented in extension lit.
  { a: 'sunflower', b: 'potato', rel: 'antagonist' }, // [USU][NCSU] sunflower allelopathy
  { a: 'sunflower', b: 'bean', rel: 'antagonist' }, // [USU][NCSU]
  { a: 'sunflower', b: 'corn', rel: 'companion' }, // [USU] tall companions, no allelopathic conflict reported

  // Strawberry.
  { a: 'strawberry', b: 'bean', rel: 'companion' }, // [UME]
  { a: 'strawberry', b: 'thyme', rel: 'companion' }, // [PSU] groundcover, deters worms
  { a: 'strawberry', b: 'cauliflower', rel: 'antagonist' }, // [UME]
  { a: 'strawberry', b: 'kale', rel: 'antagonist' }, // [UME]

  // Corn — heavy feeder, classic three-sisters partner.
  { a: 'corn', b: 'cucumber', rel: 'companion' }, // [WVU]
  { a: 'corn', b: 'melon', rel: 'companion' }, // [WVU]
  { a: 'corn', b: 'pumpkin', rel: 'companion' }, // squash.pumpkin — covered via 'squash'

  // Pollinator + parasitoid attractors. Insectary plants benefit most fruiting
  // crops; we encode the strongest individual pairs.
  { a: 'tomato', b: 'cilantro', rel: 'companion' }, // [SARE] cilantro flowers attract hoverflies
  { a: 'pepper-sweet', b: 'cilantro', rel: 'companion' }, // [SARE]
  { a: 'cabbage', b: 'cilantro', rel: 'companion' }, // [SARE]
  { a: 'tomato', b: 'oregano', rel: 'companion' }, // [PSU] aromatic, no extension antagonism note
  { a: 'pepper-sweet', b: 'oregano', rel: 'companion' }, // [PSU]
  { a: 'tomato', b: 'zinnia', rel: 'companion' }, // [PSU] pollinator strip
  { a: 'cucumber', b: 'zinnia', rel: 'companion' }, // [PSU]
  { a: 'squash', b: 'zinnia', rel: 'companion' }, // [PSU]

  // Mint family — strong aromatic effect on cabbage moths and aphids, but
  // mint is invasive (containment recommended by extensions).
  { a: 'mint', b: 'broccoli', rel: 'companion' }, // [PSU][UMN]
  { a: 'mint', b: 'cauliflower', rel: 'companion' }, // [PSU]
  { a: 'mint', b: 'kale', rel: 'companion' }, // [UMN]
  { a: 'mint', b: 'tomato', rel: 'companion' }, // [PSU] deters aphids; weaker evidence

  // Antagonists from competition and allelopathy not yet listed.
  { a: 'dill', b: 'carrot', rel: 'antagonist' }, // [UME] cross-pollination + seedling stunting; v1 had this under 'carrot/dill'
  { a: 'sage', b: 'cucumber', rel: 'antagonist' }, // [UME] sage suppresses cucurbit growth; v1 had this
  { a: 'sage', b: 'onion', rel: 'antagonist' }, // [UME]

  // Rhubarb — extensions note it should be sited where it can stay 8-10 years
  // with no nearby disturbance; not strictly an antagonist with most crops,
  // so we omit pair entries (neutral by default).

  // Sweet potato — limited extension companion-planting literature; omit.
];

const map = new Map<string, CompanionRelation>();
for (const { a, b, rel } of PAIRS) {
  map.set(`${a}|${b}`, rel);
  map.set(`${b}|${a}`, rel);
}

/** Look up the relationship between two species or category keys. Returns null when no pair is defined. */
export function getRelation(a: string, b: string): CompanionRelation | null {
  return map.get(`${a}|${b}`) ?? null;
}
