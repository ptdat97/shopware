/**
 * @sw-package inventory
 */

/**
 * Parses the raw `matched_queries` map (clause-name JSON string → score) into
 * `{ parsed, score }` entries, skipping any key that is not valid JSON. Single
 * source for the clause scan the explain panel and its `hasExplain` gate share.
 *
 * @private
 */
export function parseClauses(matchedQueries) {
    if (!matchedQueries) {
        return [];
    }

    return Object.keys(matchedQueries).flatMap((clause) => {
        try {
            return [{ parsed: JSON.parse(clause), score: parseFloat(matchedQueries[clause]) || 0 }];
        } catch {
            return [];
        }
    });
}

/**
 * A field clause is what the core panel explains: an object clause that is
 * neither a boost nor a cross-entity clause (those are the AdvancedSearch
 * extension's sections). Key presence, not truthiness — a boost of `0` is still
 * a boost clause, and a non-object (e.g. a bare name string) is never a field.
 *
 * @private
 */
export function isFieldClause(parsed) {
    return parsed !== null && typeof parsed === 'object' && !('boost' in parsed) && !('crossEntity' in parsed);
}
