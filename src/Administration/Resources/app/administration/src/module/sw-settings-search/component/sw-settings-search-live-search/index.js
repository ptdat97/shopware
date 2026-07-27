/**
 * @sw-package inventory
 */
import template from './sw-settings-search-live-search.html.twig';
import './sw-settings-search-live-search.scss';
import '../sw-settings-search-live-search-keyword';

const { Mixin } = Shopware;
const { Criteria } = Shopware.Data;

// eslint-disable-next-line sw-deprecation-rules/private-feature-declarations
export default {
    template,

    inject: [
        'repositoryFactory',
        'liveSearchService',
    ],

    emits: [
        'live-search-results-change',
        'sales-channel-change',
    ],

    mixins: [
        Mixin.getByName('notification'),
    ],

    props: {
        currentSalesChannelId: {
            type: String,
            required: false,
            default: null,
        },

        searchTerms: {
            type: String,
            required: false,
            default: null,
        },

        searchResults: {
            type: Object,
            required: false,
            default: null,
        },
    },

    data() {
        return {
            liveSearchTerm: '',
            executedSearchTerm: '',
            salesChannels: [],
            salesChannelId: this.currentSalesChannelId,
            productSortings: [],
            productSortingKey: null,
            liveSearchResults: null,
            searchInProgress: false,
            showExampleModal: false,
            selectedExplainId: null,
        };
    },

    computed: {
        salesChannelRepository() {
            return this.repositoryFactory.create('sales_channel');
        },

        productSortingRepository() {
            return this.repositoryFactory.create('product_sorting');
        },

        isSearchEnable() {
            return this.salesChannelId !== null;
        },

        searchColumns() {
            return [
                {
                    property: 'name',
                    label: this.$t('sw-settings-search.liveSearchTab.labelName'),
                    rawData: true,
                },
                {
                    property: 'score',
                    label: this.$t('sw-settings-search.liveSearchTab.labelScore'),
                    rawData: true,
                },
            ];
        },

        products() {
            return this.liveSearchResults && this.liveSearchResults.elements;
        },

        resultItems() {
            return this.products;
        },

        /**
         * The term the displayed results were actually searched for —
         * snapshotted when the search runs, NOT the live input, which changes
         * on every keystroke while the old results are still on screen. The
         * AdvancedSearch override keeps its own executed term and overrides
         * this accordingly, so the shared explain helpers can read it.
         */
        currentSearchTerm() {
            return this.executedSearchTerm ?? '';
        },

        resultOffset() {
            return 0;
        },

        topScore() {
            if (!this.resultItems || !this.resultItems.length) {
                return 0;
            }

            return this.resultItems.reduce((max, product) => {
                return Math.max(max, this.getScoreValue(product));
            }, 0);
        },

        selectedExplainItem() {
            if (this.selectedExplainId === null || !this.resultItems) {
                return null;
            }

            return this.resultItems.find((product) => this.explainKey(product) === this.selectedExplainId) ?? null;
        },

        scoresAreUniform() {
            if (!this.resultItems || this.resultItems.length < 2) {
                return false;
            }

            const first = this.getScoreValue(this.resultItems[0]);

            return this.resultItems.every((product) => this.getScoreValue(product) === first);
        },

        productSortingCriteria() {
            const criteria = new Criteria(1, 25);
            criteria.addFilter(Criteria.equals('active', true));
            criteria.addSorting(Criteria.sort('priority', 'DESC'));
            return criteria;
        },

        searchParams() {
            const params = {
                salesChannelId: this.salesChannelId,
                search: this.liveSearchTerm,
            };

            if (this.productSortingKey) {
                params.order = this.productSortingKey;
            }

            return params;
        },
    },

    created() {
        this.createdComponent();
    },

    methods: {
        createdComponent() {
            this.fetchSalesChannels();
            this.fetchProductSortings();
            this.liveSearchTerm = this.searchTerms;
            this.executedSearchTerm = this.searchTerms;
            this.liveSearchResults = this.searchResults;
        },

        searchOnStorefront() {
            // The result set is about to change (or no longer matches an
            // emptied input) — close any open explain panel so it can't point
            // at a stale row.
            this.selectedExplainId = null;

            if (!this.liveSearchTerm.length) {
                return;
            }

            this.executedSearchTerm = this.liveSearchTerm;
            this.searchInProgress = true;

            this.liveSearchService
                .search(this.searchParams, {}, {}, { 'sw-language-id': Shopware.Context.api.languageId })
                .then((data) => {
                    this.liveSearchResults = data.data;
                    this.searchInProgress = false;
                    this.$emit('live-search-results-change', {
                        searchTerms: this.liveSearchTerm,
                        searchResults: this.liveSearchResults,
                    });
                })
                .catch((error) => {
                    const message =
                        error.response?.status === 500
                            ? this.$t('sw-settings-search.notification.notSupportedLanguageError')
                            : error.message;

                    this.createNotificationError({
                        message,
                    });
                })
                .finally(() => {
                    this.searchInProgress = false;
                });
        },

        fetchSalesChannels() {
            this.salesChannelRepository.search(new Criteria(1, 25)).then((response) => {
                this.salesChannels = response;
            });
        },

        fetchProductSortings() {
            this.productSortingRepository.search(this.productSortingCriteria).then((response) => {
                this.productSortings = response;
                const topSearchSorting = this.productSortings.find((entry) => entry.key === 'score');

                if (topSearchSorting) {
                    this.productSortingKey = topSearchSorting.key;
                }
            });
        },

        changeSalesChannel(salesChannelId) {
            this.salesChannelId = salesChannelId;
            this.$emit('sales-channel-change', salesChannelId);
        },

        onShowExampleModal() {
            this.showExampleModal = true;
        },

        onCloseExampleModal() {
            this.showExampleModal = false;
        },

        explainKey(item) {
            return item.id ?? null;
        },

        getScoreValue(item) {
            return parseFloat(item?.extensions?.search?._score) || 0;
        },

        formatScore(value) {
            const score = parseFloat(value) || 0;

            return Number.isInteger(score) ? `${score}` : score.toFixed(1);
        },

        getScoreBarWidth(item) {
            if (!this.topScore) {
                return '0%';
            }

            return `${Math.max(2, (this.getScoreValue(item) / this.topScore) * 100)}%`;
        },

        getRank(item) {
            if (!this.resultItems) {
                return null;
            }

            const index = this.resultItems.indexOf(item);

            if (index === -1) {
                return null;
            }

            return this.resultOffset + index + 1;
        },

        /**
         * A row is only explainable when its matched_queries yield at least one
         * renderable breakdown row — the map itself can be present but empty,
         * or contain only boost / cross-entity / foreign clauses, and a
         * clickable score whose panel never opens is worse than none. Mirrors
         * the clause filter of `sw-settings-search-live-search-explain`'s
         * `collectFieldRows`; the AdvancedSearch extension (which explains
         * boost / cross-entity clauses in its own sections) widens this check.
         */
        hasExplain(item) {
            const matchedQueries = item?.extensions?.search?.matched_queries;

            if (!matchedQueries) {
                return false;
            }

            return Object.keys(matchedQueries).some((matchedQuery) => {
                try {
                    const parsedQuery = JSON.parse(matchedQuery);

                    return !parsedQuery.boost && !parsedQuery.crossEntity;
                } catch {
                    return false;
                }
            });
        },

        toggleExplain(item) {
            const key = this.explainKey(item);
            this.selectedExplainId = this.selectedExplainId === key ? null : key;
        },

        isExplainOpen(item) {
            return this.selectedExplainId !== null && this.selectedExplainId === this.explainKey(item);
        },
    },
};
