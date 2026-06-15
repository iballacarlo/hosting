import React from 'react'

export const DEFAULT_PAGE_SIZE = 5

export function paginateItems(items, page, pageSize = DEFAULT_PAGE_SIZE){
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages,
    safePage,
    start,
    end: Math.min(start + pageSize, items.length)
  }
}

export default function Pagination({ page, totalPages, totalItems, start, end, onPageChange }){
  if(totalItems <= DEFAULT_PAGE_SIZE) return null

  return (
    <div className="pagination-bar">
      <span className="pagination-summary">
        Showing {start + 1}-{end} of {totalItems}
      </span>
      <div className="pagination-actions">
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <span className="pagination-page">Page {page} of {totalPages}</span>
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  )
}
