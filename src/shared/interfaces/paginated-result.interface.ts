/** Метаданные пагинации */
export interface PaginationMeta {
  /** Текущая страница (начинается с 1) */
  page: number;
  /** Размер страницы */
  pageSize: number;
  /** Общее количество записей */
  total: number;
  /** Общее количество страниц */
  totalPages: number;
}

/** Результат запроса с пагинацией */
export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}
