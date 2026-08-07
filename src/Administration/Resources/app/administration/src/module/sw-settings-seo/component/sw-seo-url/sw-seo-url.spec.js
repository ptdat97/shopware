/**
 * @sw-package inventory
 */

import { mount } from '@vue/test-utils';

// from Defaults.php
const STOREFRONT_TYPE_ID = '8a243080f92e4c719546314b577cf82b';
const HEADLESS_TYPE_ID = 'f183ee5650cf4bdb8a774337575067a6';
const PRODUCT_COMPARISON_TYPE_ID = 'ed535e5722134ac1aa6524f73e26881b';
const AGENTIC_COMMERCE_TYPE_ID = '5e29f9890c4d4d519a1c7f9d5c24b7c1';

const STOREFRONT_SALES_CHANNEL_ID = '863137935ecf48999d69096de547b090';
const HEADLESS_SALES_CHANNEL_ID = 'headless-sales-channel-id';
const HEADLESS_NO_DOMAIN_SALES_CHANNEL_ID = 'headless-no-domain-sales-channel-id';
const PRODUCT_COMPARISON_SALES_CHANNEL_ID = 'product-comparison-sales-channel-id';
const AGENTIC_COMMERCE_SALES_CHANNEL_ID = 'agentic-commerce-sales-channel-id';

const FK = '4066b6039fcf41f089bdf859cc6ce662';
const LANGUAGE_ID = '2fbb5fe2e29a4d70aa5854ce7ce3e20b'; // Shopware.Context.api.languageId in tests

// Resolves the entity behind any (storefront or store-api) route, so the preview mock can emulate the
// backend's route resolution from the routeName the component sends.
const ENTITY_BY_ROUTE = {
    'frontend.detail.page': 'product',
    'frontend.navigation.page': 'category',
    'frontend.landing.page': 'landing_page',
    'store-api.product.detail': 'product',
    'store-api.category.detail': 'category',
    'store-api.landing-page.detail': 'landing_page',
};

// The concrete route + path the backend resolves to per entity and sales channel family.
const RESOLVED_ROUTE = {
    storefront: {
        product: { routeName: 'frontend.detail.page', pathInfo: `/detail/${FK}` },
        category: { routeName: 'frontend.navigation.page', pathInfo: `/navigation/${FK}` },
        landing_page: { routeName: 'frontend.landing.page', pathInfo: `/landingPage/${FK}` },
    },
    headless: {
        product: { routeName: 'store-api.product.detail', pathInfo: `/store-api/product/${FK}` },
        category: { routeName: 'store-api.category.detail', pathInfo: `/store-api/category/${FK}` },
        landing_page: { routeName: 'store-api.landing-page.detail', pathInfo: `/store-api/landing-page/${FK}` },
    },
};

const HEADLESS_DOMAIN = 'https://headless.example.com';

const SALES_CHANNELS = [
    { id: STOREFRONT_SALES_CHANNEL_ID, typeId: STOREFRONT_TYPE_ID },
    {
        id: HEADLESS_SALES_CHANNEL_ID,
        typeId: HEADLESS_TYPE_ID,
        domains: [{ isExternalStorefront: true, languageId: LANGUAGE_ID, url: HEADLESS_DOMAIN }],
    },
    { id: HEADLESS_NO_DOMAIN_SALES_CHANNEL_ID, typeId: HEADLESS_TYPE_ID, domains: [{ isExternalStorefront: false }] },
    { id: PRODUCT_COMPARISON_SALES_CHANNEL_ID, typeId: PRODUCT_COMPARISON_TYPE_ID },
    { id: AGENTIC_COMMERCE_SALES_CHANNEL_ID, typeId: AGENTIC_COMMERCE_TYPE_ID },
];

function createEntityCollection(entities = []) {
    return new Shopware.Data.EntityCollection('collection', 'collection', {}, null, entities);
}

function setSalesChannels(channels = SALES_CHANNELS) {
    Shopware.Store.get('swSeoUrl').salesChannelCollection = createEntityCollection(channels);
}

function seoUrl(overrides = {}) {
    return {
        id: 'c0221c1f712a4f369a79e924a10fa398',
        foreignKey: FK,
        languageId: '12345678',
        pathInfo: `/detail/${FK}`,
        routeName: 'frontend.detail.page',
        salesChannelId: null,
        seoPathInfo: 'Awesome-product/',
        ...overrides,
    };
}

function expectedCurrentSeoUrl({ routeName, pathInfo, salesChannelId, foreignKey = FK }) {
    return { foreignKey, isCanonical: true, languageId: LANGUAGE_ID, pathInfo, routeName, salesChannelId, isModified: true };
}

async function createWrapper() {
    return mount(await wrapTestComponent('sw-seo-url', { sync: true }), {
        global: {
            renderStubDefaultSlot: true,
            stubs: {
                'mt-card': { template: '<div><slot name="toolbar"></slot></div>' },
                'sw-sales-channel-switch': true,
                'sw-text-field': true,
                'sw-inherit-wrapper': true,
            },
            provide: {
                repositoryFactory: {
                    create: (entity) => ({
                        search: () =>
                            Promise.resolve(entity === 'sales_channel' ? createEntityCollection(SALES_CHANNELS) : []),
                        create: () => ({}),
                        schema: { entity: {} },
                    }),
                },
                seoUrlTemplateService: {
                    // Emulates the backend preview: resolves the entity from the routeName the component sends,
                    // then returns the resolved route + path for the sales channel type (the backend sets the
                    // routeName on every preview result, so a storefront channel keeps the frontend route).
                    preview: jest.fn((payload) => {
                        const entityName = ENTITY_BY_ROUTE[payload.routeName];

                        if (!entityName) {
                            return Promise.resolve(null);
                        }

                        const isHeadless = payload.salesChannelId === HEADLESS_SALES_CHANNEL_ID;
                        const resolved = isHeadless
                            ? RESOLVED_ROUTE.headless[entityName]
                            : RESOLVED_ROUTE.storefront[entityName];

                        return Promise.resolve([{ ...resolved, foreignKey: FK }]);
                    }),
                },
            },
        },
    });
}

describe('src/module/sw-settings-seo/component/sw-seo-url', () => {
    let wrapper;

    beforeEach(async () => {
        wrapper = await createWrapper();
        Shopware.Store.get('swSeoUrl').currentSeoUrl = '';
    });

    it('sales channel switch should not be disabled', async () => {
        await wrapper.setData({ showEmptySeoUrlError: false });

        expect(wrapper.find('sw-sales-channel-switch-stub').attributes().disabled).toBeUndefined();
    });

    it('sales channel switch should be disabled', async () => {
        wrapper.vm.showEmptySeoUrlError = false;
        await wrapper.setProps({ disabled: true });

        expect(wrapper.find('sw-sales-channel-switch-stub').attributes().disabled).toBe('true');
    });

    it('should update currentSeoUrl when defaultSeoUrl empty', async () => {
        await wrapper.setProps({
            urls: [
                seoUrl({
                    pathInfo: `/navigation/${FK}`,
                    routeName: 'frontend.navigation.page',
                    salesChannelId: STOREFRONT_SALES_CHANNEL_ID,
                    seoPathInfo: 'Computers/',
                }),
            ],
            salesChannelId: STOREFRONT_SALES_CHANNEL_ID,
        });
        await wrapper.setData({ showEmptySeoUrlError: false, currentSalesChannelId: STOREFRONT_SALES_CHANNEL_ID });
        await wrapper.vm.$nextTick();

        await wrapper.vm.refreshCurrentSeoUrl();

        expect(wrapper.vm.defaultSeoUrl).toEqual({});
        expect(wrapper.vm.currentSeoUrl).toEqual(
            expectedCurrentSeoUrl({
                routeName: 'frontend.navigation.page',
                pathInfo: `/navigation/${FK}`,
                salesChannelId: STOREFRONT_SALES_CHANNEL_ID,
            }),
        );
    });

    it('should update currentSeoUrl when defaultSeoUrl empty and the salesChannel has no seo urls yet', async () => {
        await wrapper.setProps({
            // the seo url belongs to another sales channel, so no default seo url exists for the selected one
            urls: [
                seoUrl({
                    pathInfo: `/navigation/${FK}`,
                    routeName: 'frontend.navigation.page',
                    salesChannelId: FK,
                    seoPathInfo: 'Computers/',
                }),
            ],
            salesChannelId: 'a-sales-channel-without-seo-urls',
        });
        await wrapper.setData({ showEmptySeoUrlError: false, currentSalesChannelId: STOREFRONT_SALES_CHANNEL_ID });
        await wrapper.vm.$nextTick();

        await wrapper.vm.refreshCurrentSeoUrl();

        expect(wrapper.vm.defaultSeoUrl).toEqual({});
        expect(wrapper.vm.currentSeoUrl).toEqual(
            expectedCurrentSeoUrl({
                routeName: 'frontend.navigation.page',
                pathInfo: `/navigation/${FK}`,
                salesChannelId: STOREFRONT_SALES_CHANNEL_ID,
            }),
        );
    });

    it.each([
        ['seo/url%/1'],
        ['foo/bar#baz'],
        ['foo\\bar'],
    ])('reports a validation error for disallowed character in "%s"', async (invalidPath) => {
        Shopware.Store.get('swSeoUrl').currentSeoUrl = {
            seoPathInfo: invalidPath,
        };

        expect(wrapper.vm.seoPathInfoError).toEqual(
            expect.objectContaining({ code: 'CONTENT__SEO_URL_INVALID_CHARACTERS' }),
        );
    });

    it.each([
        ['Computers/Laptops'],
        ['Pepper-white-ground-pearl/SW10098'],
        ['foo/bar?x=1'],
        ['caf%C3%A9/SW10098'],
        // headless channels store absolute URLs; they must not be flagged either
        ['https://example.com/product'],
        [''],
        [null],
    ])('accepts "%s" as SEO path', async (validPath) => {
        Shopware.Store.get('swSeoUrl').currentSeoUrl = {
            seoPathInfo: validPath,
        };

        expect(wrapper.vm.seoPathInfoError).toBeNull();
    });

    it('should update currentSeoUrl when defaultSeoUrl not empty', async () => {
        const defaultSeoUrl = {
            id: '123456789',
            foreignKey: '12345678910111213',
            languageId: '1234567891011',
            pathInfo: '/navigation/123456789',
            routeName: 'frontend.product-detail.page',
            salesChannelId: null,
            seoPathInfo: 'Product-detail/',
        };

        await wrapper.setProps({
            urls: [
                seoUrl({
                    pathInfo: `/navigation/${FK}`,
                    routeName: 'frontend.navigation.page',
                    salesChannelId: STOREFRONT_SALES_CHANNEL_ID,
                    seoPathInfo: 'Computers/',
                }),
                defaultSeoUrl,
            ],
            salesChannelId: STOREFRONT_SALES_CHANNEL_ID,
        });
        await wrapper.setData({ showEmptySeoUrlError: false, currentSalesChannelId: STOREFRONT_SALES_CHANNEL_ID });
        await wrapper.vm.$nextTick();

        await wrapper.vm.refreshCurrentSeoUrl();

        expect(wrapper.vm.defaultSeoUrl).toEqual(defaultSeoUrl);
        expect(wrapper.vm.currentSeoUrl).toEqual(
            expectedCurrentSeoUrl({
                foreignKey: '12345678910111213',
                routeName: 'frontend.product-detail.page',
                pathInfo: '/navigation/123456789',
                salesChannelId: STOREFRONT_SALES_CHANNEL_ID,
            }),
        );
    });

    it.each([
        [
            'storefront',
            STOREFRONT_SALES_CHANNEL_ID,
            false,
        ],
        [
            'headless',
            HEADLESS_SALES_CHANNEL_ID,
            false,
        ],
        [
            'product comparison',
            PRODUCT_COMPARISON_SALES_CHANNEL_ID,
            true,
        ],
        [
            'agentic commerce',
            AGENTIC_COMMERCE_SALES_CHANNEL_ID,
            true,
        ],
        [
            'none selected',
            null,
            false,
        ],
    ])('should flag SEO URL support for a %s sales channel', async (_, salesChannelId, unsupported) => {
        setSalesChannels();

        wrapper.vm.currentSalesChannelId = salesChannelId;

        expect(wrapper.vm.isUnsupportedSalesChannel).toBe(unsupported);
    });

    it('should only expose the not-supported help text for unsupported sales channel types', async () => {
        setSalesChannels();

        // headless is allowed and shows no help text, product comparison is not
        wrapper.vm.currentSalesChannelId = HEADLESS_SALES_CHANNEL_ID;
        expect(wrapper.vm.seoUrlHelptext).toBeNull();

        wrapper.vm.currentSalesChannelId = PRODUCT_COMPARISON_SALES_CHANNEL_ID;
        expect(wrapper.vm.seoUrlHelptext).toBe('sw-seo-url.textSeoUrlsNotSupported');
    });

    it('should not flag a relative seo path for a headless sales channel', async () => {
        setSalesChannels();
        Shopware.Store.get('swSeoUrl').currentSeoUrl = { seoPathInfo: 'some/relative/path' };

        wrapper.vm.currentSalesChannelId = HEADLESS_SALES_CHANNEL_ID;

        // headless templates may be relative (resolved against the sales channel domain), so no error
        expect(wrapper.vm.seoPathInfoError).toBeNull();
    });

    it.each([
        [
            'frontend.detail.page',
            'store-api.product.detail',
            `/store-api/product/${FK}`,
        ],
        [
            'frontend.navigation.page',
            'store-api.category.detail',
            `/store-api/category/${FK}`,
        ],
        [
            'frontend.landing.page',
            'store-api.landing-page.detail',
            `/store-api/landing-page/${FK}`,
        ],
    ])(
        'derives the store-api route and path from the headless template preview for %s',
        async (sourceRouteName, expectedRouteName, expectedPathInfo) => {
            setSalesChannels();

            // select the headless channel first, so the url-watch derives against it (not the default null channel)
            await wrapper.setData({ showEmptySeoUrlError: false, currentSalesChannelId: HEADLESS_SALES_CHANNEL_ID });
            await wrapper.setProps({
                // a default (all-channels) url identifies the entity but has no path for the headless channel yet,
                // so the store-api route and path are derived from the template preview
                urls: [
                    seoUrl({
                        pathInfo: null,
                        routeName: sourceRouteName,
                        salesChannelId: null,
                        seoPathInfo: 'Computers/',
                    }),
                ],
                salesChannelId: HEADLESS_SALES_CHANNEL_ID,
            });
            await wrapper.vm.$nextTick();

            await wrapper.vm.refreshCurrentSeoUrl();

            // the component sends the source (storefront) route; the backend swaps it to the store-api route
            expect(wrapper.vm.seoUrlTemplateService.preview).toHaveBeenCalledWith(
                expect.objectContaining({ routeName: sourceRouteName, salesChannelId: HEADLESS_SALES_CHANNEL_ID }),
            );

            expect(wrapper.vm.currentSeoUrl).toEqual(
                expectedCurrentSeoUrl({
                    routeName: expectedRouteName,
                    pathInfo: expectedPathInfo,
                    salesChannelId: HEADLESS_SALES_CHANNEL_ID,
                }),
            );
        },
    );

    it('generates the route and path from the storefront template preview for a storefront sales channel', async () => {
        setSalesChannels();

        // select the storefront channel first, so the url-watch derives against it
        await wrapper.setData({ showEmptySeoUrlError: false, currentSalesChannelId: STOREFRONT_SALES_CHANNEL_ID });
        await wrapper.setProps({
            // a default (all-channels) url without a path for this channel triggers the preview-based derivation
            urls: [
                seoUrl({
                    pathInfo: null,
                    routeName: 'frontend.navigation.page',
                    salesChannelId: null,
                    seoPathInfo: 'Computers/',
                }),
            ],
            salesChannelId: STOREFRONT_SALES_CHANNEL_ID,
        });
        await wrapper.vm.$nextTick();

        await wrapper.vm.refreshCurrentSeoUrl();

        // a storefront channel keeps the frontend route family - the store-api template must not be used
        expect(wrapper.vm.seoUrlTemplateService.preview).toHaveBeenCalledWith(
            expect.objectContaining({ routeName: 'frontend.navigation.page', salesChannelId: STOREFRONT_SALES_CHANNEL_ID }),
        );

        expect(wrapper.vm.currentSeoUrl).toEqual(
            expectedCurrentSeoUrl({
                routeName: 'frontend.navigation.page',
                pathInfo: `/navigation/${FK}`,
                salesChannelId: STOREFRONT_SALES_CHANNEL_ID,
            }),
        );
    });

    it('keeps the fallback route and path when the preview returns no result', async () => {
        setSalesChannels();

        await wrapper.setData({ showEmptySeoUrlError: false, currentSalesChannelId: HEADLESS_SALES_CHANNEL_ID });
        await wrapper.setProps({
            urls: [
                seoUrl({
                    pathInfo: '/custom/1',
                    routeName: 'frontend.custom.page',
                    salesChannelId: FK,
                    seoPathInfo: 'Custom/',
                }),
            ],
            salesChannelId: HEADLESS_SALES_CHANNEL_ID,
        });
        await wrapper.vm.$nextTick();

        await wrapper.vm.refreshCurrentSeoUrl();

        // an unknown route yields no preview row, so the fallback route/path from the existing url is kept
        expect(wrapper.vm.seoUrlTemplateService.preview).toHaveBeenCalledWith(
            expect.objectContaining({ routeName: 'frontend.custom.page', salesChannelId: HEADLESS_SALES_CHANNEL_ID }),
        );
        expect(wrapper.vm.currentSeoUrl).toEqual(
            expectedCurrentSeoUrl({
                routeName: 'frontend.custom.page',
                pathInfo: '/custom/1',
                salesChannelId: HEADLESS_SALES_CHANNEL_ID,
            }),
        );
    });

    it('does not map the storefront fallback url for a storefront sales channel', async () => {
        setSalesChannels();

        await wrapper.setProps({
            urls: [
                seoUrl({
                    pathInfo: `/navigation/${FK}`,
                    routeName: 'frontend.navigation.page',
                    salesChannelId: FK,
                    seoPathInfo: 'Computers/',
                }),
            ],
            salesChannelId: STOREFRONT_SALES_CHANNEL_ID,
        });
        await wrapper.setData({ showEmptySeoUrlError: false, currentSalesChannelId: STOREFRONT_SALES_CHANNEL_ID });
        await wrapper.vm.$nextTick();

        await wrapper.vm.refreshCurrentSeoUrl();

        expect(wrapper.vm.currentSeoUrl).toEqual(
            expectedCurrentSeoUrl({
                routeName: 'frontend.navigation.page',
                pathInfo: `/navigation/${FK}`,
                salesChannelId: STOREFRONT_SALES_CHANNEL_ID,
            }),
        );
    });

    it('shows the external-storefront requirement help text and disables input for a headless channel without a matching domain', async () => {
        setSalesChannels();

        wrapper.vm.currentSalesChannelId = HEADLESS_NO_DOMAIN_SALES_CHANNEL_ID;

        expect(wrapper.vm.headlessExternalStorefrontUrl).toBeNull();
        expect(wrapper.vm.seoUrlHelptext).toBe('sw-seo-url-template-card.general.textExternalStorefrontRequired');
        expect(wrapper.vm.allowInput).toBe(false);
    });

    it('exposes the external storefront domain with a trailing slash as prefix for a headless sales channel', async () => {
        setSalesChannels();

        wrapper.vm.currentSalesChannelId = HEADLESS_SALES_CHANNEL_ID;

        expect(wrapper.vm.headlessExternalStorefrontUrl).toBe(`${HEADLESS_DOMAIN}/`);
        expect(wrapper.vm.seoUrlHelptext).toBeNull();
        expect(wrapper.vm.allowInput).toBe(true);
    });

    it('does not require an external storefront domain for a non-headless sales channel', async () => {
        setSalesChannels();

        wrapper.vm.currentSalesChannelId = STOREFRONT_SALES_CHANNEL_ID;

        expect(wrapper.vm.headlessExternalStorefrontUrl).toBeNull();
        expect(wrapper.vm.seoUrlHelptext).toBeNull();
        expect(wrapper.vm.allowInput).toBe(true);
    });
});
