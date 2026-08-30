export interface Page<T> {

    items: T[];

    page: number;

    pageSize: number;

    totalItems: number;

    totalPages: number;

}

export function getSkip(
    page: number,
    pageSize: number,
) {
    return (page - 1) * pageSize;
}