/**
 * @sw-package inventory
 */
import template from './sw-settings-search-live-search-explain.html.twig';
import './sw-settings-search-live-search-explain.scss';
import { parseClauses, isFieldClause } from '../../helper/explain.helper';

/**
 * The "Why this ranking?" breakdown for one live-search result row. The parent
 * owns the grid and which row is expanded; the AdvancedSearch extension
 * overrides `getExplainBreakdown` here to add its boosting / cross-search
 * sections.
 */
// eslint-disable-next-line sw-deprecation-rules/private-feature-declarations
export default {
    template,

    props: {
        item: {
            type: Object,
            required: true,
        },

        // The term the displayed results were actually searched for.
        searchTerm: {
            type: String,
            required: false,
            default: '',
        },

        // All results share one score — the order is a tie, and the panel says so.
        scoresAreUniform: {
            type: Boolean,
            required: false,
            default: false,
        },
    },

    computed: {
        breakdown() {
            return this.getExplainBreakdown(this.item);
        },

        explainName() {
            return this.item.translated?.name ?? this.item.name ?? '';
        },
    },

    methods: {
        getScoreValue(item) {
            return parseFloat(item?.extensions?.search?._score) || 0;
        },

        formatScore(value) {
            const score = parseFloat(value) || 0;

            return Number.isInteger(score) ? `${score}` : score.toFixed(1);
        },

        getExplainBreakdown(item) {
            const matchedQueries = item?.extensions?.search?.matched_queries;

            if (!matchedQueries) {
                return null;
            }

            const name = item?.translated?.name ?? item?.name ?? '';
            const rows = this.toSignalRows(this.collectFieldRows(matchedQueries), name);

            if (!rows.length) {
                return null;
            }

            return {
                total: this.getScoreValue(item),
                terms: this.termCoverage(matchedQueries),
                sections: [
                    {
                        label: this.$t('sw-settings-search.liveSearchTab.relevance'),
                        rows,
                    },
                ],
            };
        },

        termCoverage(matchedQueries) {
            const words = this.searchTerm.toLowerCase().split(/\s+/).filter(Boolean);

            if (words.length < 2) {
                return null;
            }

            // Whole-word equality — "iron" must not count "on" as matched; a
            // phrase term ("paper rippers") covers each of its words.
            const matchedWords = new Set(
                parseClauses(matchedQueries).flatMap(({ parsed }) =>
                    (parsed.term ?? '').toLowerCase().split(/\s+/).filter(Boolean),
                ),
            );

            const matched = words.filter((word) => matchedWords.has(word));
            const missed = words.filter((word) => !matchedWords.has(word));

            return { matched, missed };
        },

        /**
         * Turns the per-clause `matched_queries` into field rows, each keeping
         * ONE signal per search term — the MOST SPECIFIC match type that fired
         * for it (exact > prefix > fuzzy > partial), not the highest-scoring one.
         * A word that matches exactly is also trivially a prefix / fuzzy / ngram
         * match of itself, and the `partial` (ngram) clause tends to out-score
         * the others (especially at a low `min_gram`), so picking by score would
         * mislabel almost everything as `partial` and hide real prefix / fuzzy
         * matches. Picking by specificity keeps the label meaningful; `partial`
         * only wins when it is the ONLY way a term matched (a true fragment hit,
         * whose shared fragment is explained in `toSignalRows`).
         */
        collectFieldRows(matchedQueries) {
            const groups = new Map();

            parseClauses(matchedQueries).forEach(({ parsed: parsedQuery, score: rawScore }) => {
                // Boost / cross-entity clauses are explained by the AdvancedSearch extension.
                if (!isFieldClause(parsedQuery)) {
                    return;
                }

                const label = this.humanizeField(parsedQuery.field);

                // Nested / leaf fields are named at the field level, so their score already
                // includes the field weight; text fields are named per clause, so their score
                // is the raw relevance without it. Scale the un-weighted ones by their ranking
                // so every field's contribution is on the same footing and the bars compare.
                const ranking = parsedQuery.ranking ?? 1;
                const score = parsedQuery.weighted ? rawScore : rawScore * ranking;

                if (!groups.has(label)) {
                    groups.set(label, { label, ranking: parsedQuery.ranking ?? null, signals: new Map() });
                }

                const group = groups.get(label);

                if (parsedQuery.ranking !== null && parsedQuery.ranking !== undefined) {
                    group.ranking = Math.max(group.ranking ?? 0, parsedQuery.ranking);
                }

                // Key by term (falling back to type) so each search word keeps
                // only its most representative match type.
                const signalKey = parsedQuery.term ?? parsedQuery.type ?? '';
                const candidate = { type: parsedQuery.type ?? null, term: parsedQuery.term ?? null, score };
                const existing = group.signals.get(signalKey);

                if (!existing || this.isMoreSpecificSignal(candidate, existing)) {
                    group.signals.set(signalKey, candidate);
                }
            });

            return [...groups.values()].map((group) => ({
                label: group.label,
                ranking: group.ranking,
                signals: [...group.signals.values()],
            }));
        },

        /**
         * Specificity ranking of match types for display: a whole-phrase match is
         * the strongest statement, then exact word, prefix (starts-with), fuzzy
         * (typo), and finally partial (shared fragment). Used to pick which type
         * represents a term when several clauses fired for it — e.g. a multi-word
         * term matches both `phrase` (match_phrase) and `prefix`
         * (match_phrase_prefix); `phrase` must win so its (boosted) score shows.
         * Unknown types sort last.
         */
        matchTypeRank(type) {
            return { phrase: 0, exact: 1, prefix: 2, fuzzy: 3, ngram: 4 }[type] ?? 5;
        },

        isMoreSpecificSignal(candidate, existing) {
            const candidateRank = this.matchTypeRank(candidate.type);
            const existingRank = this.matchTypeRank(existing.type);

            if (candidateRank !== existingRank) {
                return candidateRank < existingRank;
            }

            return candidate.score > existing.score;
        },

        /**
         * Turns field/boost/cross rows into panel rows. Every clause bar is
         * scaled to the single strongest clause across the whole breakdown, so
         * bars are comparable between fields; the weight-scaled match score
         * (see collectFieldRows) is shown per clause. Rows and their clauses are ordered strongest
         * first. Deliberately NOT a "% of total" — Elasticsearch keeps the
         * strongest clause plus a fraction of the rest and then applies the
         * field weight, so clause scores do not sum to `_score`. Shared by the
         * AdvancedSearch override for its boosting / cross-search sections.
         *
         * `fieldText` (the result's name) is used to explain `partial` (ngram)
         * matches, which hit on a shared letter fragment rather than the whole
         * word — e.g. "copper" matching "Paper" via "per".
         */
        toSignalRows(rows, fieldText = '') {
            const max = rows.flatMap((row) => row.signals).reduce((m, signal) => Math.max(m, signal.score), 0) || 1;

            return rows
                .map((row) => ({
                    label: row.label,
                    ranking: row.ranking ?? null,
                    top: row.signals.reduce((m, signal) => Math.max(m, signal.score), 0),
                    signals: [...row.signals]
                        .sort((a, b) => b.score - a.score)
                        .map((signal) => {
                            // A multi-word term comes from the whole-phrase query
                            // (`ProductSearchQueryBuilder` also searches the full search
                            // string, not only its individual words). Present it as a
                            // `phrase` match — the underlying clause is a phrase-prefix,
                            // but "phrase" is what it means to a merchant, and the
                            // single-word fragment hint below would be misleading for it.
                            // Only for typed (field) signals — the AdvancedSearch
                            // boost / cross-search signals are typeless and stay flat.
                            const isPhrase = !!signal.type && (signal.term ?? '').includes(' ');

                            return {
                                type: isPhrase ? 'phrase' : (signal.type ?? null),
                                term: signal.term ?? null,
                                score: this.formatScore(signal.score),
                                barWidth: `${Math.max(2, (signal.score / max) * 100)}%`,
                                // Point a single-word partial / prefix match at the word it
                                // hit (name field only — that's the text we have on the
                                // result). Exact / fuzzy / phrase are self-explanatory.
                                context:
                                    !isPhrase &&
                                    [
                                        'ngram',
                                        'prefix',
                                    ].includes(signal.type) &&
                                    row.label === 'name'
                                        ? this.matchedFragment(signal.term, fieldText)
                                        : null,
                            };
                        }),
                }))
                .sort((a, b) => b.top - a.top)
                .map(({ top, ...row }) => row);
        },

        // A single typeless signal (AdvancedSearch boost / cross-search rows)
        // fits on one line — name, bar and score, no per-type rows.
        isFlatRow(row) {
            return row.signals.length === 1 && !row.signals[0].type;
        },

        /**
         * Finds the longest letter fragment (>= 3 chars, the ngram floor) that a
         * search term shares with a word in the given text, so a `partial` match
         * can be explained as e.g. `“per” in “Paper”`. Returns null when nothing
         * meaningful overlaps.
         */
        matchedFragment(term, text) {
            if (!term || !text) {
                return null;
            }

            const needle = this.foldTerm(term);
            let best = { fragment: '', word: '' };

            text.split(/\s+/)
                .filter(Boolean)
                .forEach((word) => {
                    const fragment = this.longestCommonSubstring(needle, this.foldTerm(word));

                    if (fragment.length > best.fragment.length) {
                        best = { fragment, word };
                    }
                });

            if (best.fragment.length < 3) {
                return null;
            }

            // `whole` = the entire search term appears in the word (e.g. "awe" in
            // "Awesome"), so the UI can say `in "Awesome"` rather than repeating
            // the term as `"awe" in "Awesome"`.
            return { ...best, whole: best.fragment === needle };
        },

        // Lowercase + ascii-fold like the search analyzer (ü → u, ß → ss), so
        // the fragment comparison sees the text Elasticsearch matched on.
        foldTerm(value) {
            return value
                .toLowerCase()
                .replace(/ß/g, 'ss')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
        },

        longestCommonSubstring(a, b) {
            let best = '';

            for (let i = 0; i < a.length; i += 1) {
                for (let j = i + best.length + 1; j <= a.length; j += 1) {
                    const candidate = a.slice(i, j);

                    if (b.includes(candidate)) {
                        best = candidate;
                    }
                }
            }

            return best;
        },

        humanizeField(field) {
            if (!field) {
                return '';
            }

            return field
                .split('.')
                .filter((segment) => !/^[0-9a-f]{32}$/i.test(segment))
                .filter(
                    (segment) =>
                        ![
                            'search',
                            'exact',
                            'ngram',
                        ].includes(segment),
                )
                .join('.');
        },

        // Unknown (plugin-supplied) match types fall back to the raw type
        // instead of leaking the snippet key.
        explainTypeLabel(type) {
            if (!type) {
                return '';
            }

            const snippetKey = `sw-settings-search.liveSearchTab.matchType.${type}`;
            const label = this.$t(snippetKey);

            return label === snippetKey ? type : label;
        },

        explainTypeTooltip(type) {
            if (!type) {
                return '';
            }

            const snippetKey = `sw-settings-search.liveSearchTab.matchTypeTooltip.${type}`;
            const tooltip = this.$t(snippetKey);

            return tooltip === snippetKey ? type : tooltip;
        },

        fieldLabel(field) {
            const snippetKey = {
                name: 'name',
                'parent.name': 'parentName',
                description: 'description',
                productNumber: 'productNumber',
                manufacturerNumber: 'manufacturerNumber',
                ean: 'ean',
                customSearchKeywords: 'customSearchKeywords',
                'manufacturer.name': 'manufacturerName',
                'manufacturer.customFields': 'manufacturerCustomFields',
                'categories.name': 'categoriesName',
                'categories.customFields': 'categoriesCustomFields',
                'tags.name': 'tagsName',
                metaTitle: 'metaTitle',
                metaDescription: 'metaDescription',
                'properties.name': 'propertiesValue',
                'options.name': 'variantValue',
            }[field];

            return snippetKey ? this.$t(`sw-settings-search.generalTab.configFields.${snippetKey}`) : field;
        },
    },
};
