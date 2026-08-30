export function buildOrder<
    T extends string
>(
    sort: T | undefined,
    order: "asc" | "desc",
    defaultField: T,
) {

    return sort
        ? {
            [sort]: order,
        }
        : {
            [defaultField]: "desc",
        };

}