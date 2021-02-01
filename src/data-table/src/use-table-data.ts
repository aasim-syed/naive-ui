import { computed, ref } from 'vue'
import { useMergedState } from 'vooks'
import type { DataTableProps } from './DataTable'
import type {
  ColumnKey,
  Filter,
  FilterOptionValue,
  FilterState,
  SortOrder,
  SortState,
  TableColumnInfo,
  TableNode
} from './interface'
import { createShallowClonedObject, getFlagOfOrder } from './utils'
import { PaginationProps } from '../../pagination/src/Pagination'
import { call, warn } from '../../_utils'

// useTableData combines filter, sorter and pagination

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTableData (props: DataTableProps) {
  const uncontrolledFilterStateRef = ref<FilterState>({})
  const uncontrolledSortStateRef = ref<SortState | null>(null)
  const uncontrolledCurrentPageRef = ref(1)
  const uncontrolledPageSizeRef = ref(10)

  props.columns.forEach((column) => {
    if (column.sorter !== undefined) {
      uncontrolledSortStateRef.value = {
        columnKey: column.key,
        sorter: column.sorter,
        order: column.defaultSortOrder ?? false
      }
    }
    if (column.filter) {
      const defaultFilterOptionValues = column.defaultFilterOptionValues
      if (column.filterMultiple) {
        uncontrolledFilterStateRef.value[column.key] =
          defaultFilterOptionValues || []
      } else if (defaultFilterOptionValues !== undefined) {
        // this branch is for compatibility, someone may use `values` in single filter mode
        uncontrolledFilterStateRef.value[column.key] =
          defaultFilterOptionValues === null ? [] : defaultFilterOptionValues
      } else {
        uncontrolledFilterStateRef.value[column.key] =
          column.defaultFilterOptionValue ?? null
      }
    }
  })

  const controlledCurrentPageRef = computed(() => {
    const { pagination } = props
    if (pagination === false) return undefined
    return pagination.page
  })
  const controlledPageSizeRef = computed(() => {
    const { pagination } = props
    if (pagination === false) return undefined
    return pagination.pageSize
  })

  const mergedCurrentPageRef = useMergedState(
    controlledCurrentPageRef,
    uncontrolledCurrentPageRef
  )
  const mergedPageSizeRef = useMergedState(
    controlledPageSizeRef,
    uncontrolledPageSizeRef
  )
  const mergedPageCountRef = computed(() => {
    const { pagination } = props
    if (pagination) {
      const { pageCount } = pagination
      if (pageCount !== undefined) return pageCount
    }
    const { value: filteredData } = filteredDataRef
    if (filteredData.length === 0) return 1
    const { value: pageSize } = mergedPageSizeRef
    return Math.ceil(filteredData.length / pageSize)
  })

  const mergedSortStateRef = computed<SortState | null>(() => {
    // If one of the columns's sort order is false or 'ascend' or 'descend',
    // the table's controll functionality should work in controlled manner.
    const columnsWithControlledSortOrder = props.columns.filter(
      (column) =>
        column.sorter !== undefined &&
        // skip column.sortOrder === false
        // it doesn't affect sort state
        (column.sortOrder === 'ascend' || column.sortOrder === 'descend')
    )
    const columnToSort = columnsWithControlledSortOrder[0]
    if (columnToSort) {
      return {
        columnKey: columnToSort.key,
        // column to sort has controlled sorter
        // sorter && sort order won't be undefined
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        order: columnToSort.sortOrder!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        sorter: columnToSort.sorter!
      }
    }
    if (!columnsWithControlledSortOrder.length) return null
    return uncontrolledSortStateRef.value
  })

  const mergedFilterStateRef = computed<FilterState>(() => {
    const columnsWithControlledFilter = props.columns.filter((column) => {
      return (
        column.filterOptionValues !== undefined ||
        column.filterOptionValue !== undefined
      )
    })
    const controlledFilterState: FilterState = {}
    columnsWithControlledFilter.forEach((column) => {
      controlledFilterState[column.key] =
        column.filterOptionValues || column.filterOptionValue || null
    })
    const activeFilters = Object.assign(
      createShallowClonedObject(uncontrolledFilterStateRef.value),
      controlledFilterState
    )
    return activeFilters
  })

  const filteredDataRef = computed<TableNode[]>(() => {
    const mergedFilterState = mergedFilterStateRef.value
    const { columns } = props
    function createDefaultFilter (columnKey: ColumnKey): Filter {
      return (filterOptionValue: FilterOptionValue, row: TableNode) =>
        !!~String(row[columnKey]).indexOf(String(filterOptionValue))
    }
    const { data } = props
    const columnEntries = columns.map((column) => [column.key, column] as const)
    return data
      ? data.filter((row) => {
        // traverse all filters
        for (const [columnKey, column] of columnEntries) {
          let activeFilterOptionValues = mergedFilterState[columnKey]
          if (activeFilterOptionValues == null) continue
          if (!Array.isArray(activeFilterOptionValues)) {
            activeFilterOptionValues = [activeFilterOptionValues]
          }
          if (!activeFilterOptionValues.length) continue
          // When async, filter won't be set, so data won't be filtered
          const filter =
              column.filter === 'default'
                ? createDefaultFilter(columnKey)
                : column.filter
          if (column && typeof filter === 'function') {
            if (column.filterMode === 'and') {
              if (
                activeFilterOptionValues.some(
                  (filterOptionValue) => !filter(filterOptionValue, row)
                )
              ) {
                return false
              }
            } else {
              if (
                activeFilterOptionValues.some((filterOptionValue) =>
                  filter(filterOptionValue, row)
                )
              ) {
                continue
              } else {
                return false
              }
            }
          }
        }
        return true
      })
      : []
  })

  const sortedDataRef = computed<TableNode[]>(() => {
    const activeSorter = mergedSortStateRef.value
    if (activeSorter) {
      // When async, mergedSortState.sorter should be true
      // and we sort nothing, just return the filtered data
      if (activeSorter.sorter === true || activeSorter.sorter === false) {
        return filteredDataRef.value
      }
      const filteredData = filteredDataRef.value.slice(0)
      const columnKey = activeSorter.columnKey
      // 1 for asc
      // -1 for desc
      const order = activeSorter.order
      const sorter =
        activeSorter.sorter === undefined || activeSorter.sorter === 'default'
          ? (row1: TableNode, row2: TableNode) => {
            const value1 = row1[columnKey]
            const value2 = row2[columnKey]
            if (typeof value1 === 'number' && typeof value2 === 'number') {
              return value1 - value2
            } else if (
              typeof value1 === 'string' &&
                typeof value2 === 'string'
            ) {
              return value1.localeCompare(value2)
            }
            return 0
          }
          : activeSorter.sorter
      return filteredData.sort(
        (row1, row2) => getFlagOfOrder(order) * sorter(row1, row2)
      )
    }
    return filteredDataRef.value
  })

  const paginatedDataRef = computed<TableNode[]>(() => {
    if (props.remote) return props.data
    if (!props.pagination) return sortedDataRef.value
    const pageSize = mergedPageSizeRef.value
    const startIndex = (mergedCurrentPageRef.value - 1) * pageSize
    return sortedDataRef.value.slice(startIndex, startIndex + pageSize)
  })

  function mergedOnUpdatePage (page: number): void {
    const { pagination } = props
    if (pagination) {
      const { onChange, 'onUpdate:page': onUpdatePage } = pagination
      if (onChange) call(onChange, page)
      if (onUpdatePage) call(onUpdatePage, page)
      doUpdatePage(page)
    }
  }
  function mergedOnUpdatePageSize (pageSize: number): void {
    const { pagination } = props
    if (pagination) {
      const {
        onPageSizeChange,
        'onUpdate:pageSize': onUpdatePageSize
      } = pagination
      if (onPageSizeChange) call(onPageSizeChange, pageSize)
      if (onUpdatePageSize) call(onUpdatePageSize, pageSize)
      doUpdatePageSize(pageSize)
    }
  }

  const mergedPaginationRef = computed<PaginationProps>(() => {
    return {
      ...props.pagination,
      // reset deprecated methods
      onChange: undefined,
      onPageSizeChange: undefined,
      'onUpdate:page': mergedOnUpdatePage,
      'onUpdate:pageSize': mergedOnUpdatePageSize,
      // writing merged props after pagination to avoid
      // pagination[key] === undefined
      // key still exists but value is undefined
      page: mergedCurrentPageRef.value,
      pageSize: mergedPageSizeRef.value,
      pageCount: mergedPageCountRef.value
    }
  })

  function doUpdatePage (page: number): void {
    const { 'onUpdate:page': onUpdatePage, onPageChange } = props
    if (onUpdatePage) call(onUpdatePage, page)
    if (onPageChange) call(onPageChange, page)
    uncontrolledCurrentPageRef.value = page
  }
  function doUpdatePageSize (pageSize: number): void {
    const { 'onUpdate:pageSize': onUpdatePageSize, onPageSizeChange } = props
    if (onPageSizeChange) call(onPageSizeChange, pageSize)
    if (onUpdatePageSize) call(onUpdatePageSize, pageSize)
    uncontrolledPageSizeRef.value = pageSize
  }
  function doUpdateSorter (sorter: SortState | null): void {
    const { 'onUpdate:sorter': onUpdateSorter, onSorterChange } = props
    if (onUpdateSorter) call(onUpdateSorter, sorter)
    if (onSorterChange) call(onSorterChange, sorter)
    uncontrolledSortStateRef.value = sorter
  }
  function doUpdateFilters (
    filters: FilterState,
    sourceColumn?: TableColumnInfo
  ): void {
    const { 'onUpdate:filters': onUpdateFilters, onFiltersChange } = props
    if (onUpdateFilters) call(onUpdateFilters, filters, sourceColumn)
    if (onFiltersChange) call(onFiltersChange, filters, sourceColumn)
    uncontrolledFilterStateRef.value = filters
  }
  function page (page: number): void {
    doUpdatePage(page)
  }
  function sort (columnKey: ColumnKey, order: SortOrder = 'ascend'): void {
    if (!columnKey) {
      clearSorter()
    } else {
      const columnToSort = props.columns.find(
        (column) => column.key === columnKey
      )
      if (!columnToSort || !columnToSort.sorter) return
      const sorter = columnToSort.sorter
      doUpdateSorter({
        columnKey,
        sorter,
        order: order
      })
    }
  }
  function clearSorter (): void {
    doUpdateSorter(null)
  }
  function clearFilter (): void {
    clearFilters()
  }
  function clearFilters (): void {
    filters({})
  }
  function filters (filters: FilterState | null): void {
    filter(filters)
  }
  function filter (filters: FilterState | null): void {
    if (!filters) {
      doUpdateFilters({})
    } else if (filters) {
      doUpdateFilters(createShallowClonedObject(filters))
    } else if (__DEV__) {
      warn('data-table', '`filters` is not an object')
    }
  }
  return {
    mergedCurrentPage: mergedCurrentPageRef,
    mergedPagination: mergedPaginationRef,
    paginatedData: paginatedDataRef,
    currentPage: mergedCurrentPageRef,
    mergedFilterState: mergedFilterStateRef,
    mergedSortState: mergedSortStateRef,
    doUpdateFilters,
    doUpdateSorter,
    doUpdatePageSize,
    doUpdatePage,
    // exported methods
    filter,
    filters,
    clearFilter,
    clearFilters,
    page,
    sort
  }
}