export const sortTextAsc = (items) => {
  return [...items].sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
}

export const sortByLabelAsc = (items, getLabel = item => item) => {
  return [...items].sort((a, b) => String(getLabel(a) || '').localeCompare(String(getLabel(b) || ''), undefined, { sensitivity: 'base' }))
}

export const sortCategories = (items, getLabel = item => item) => {
  return [...items].sort((a, b) => {
    const labelA = String(getLabel(a) || '')
    const labelB = String(getLabel(b) || '')
    const aIsOther = labelA.trim().toLowerCase() === 'other' || labelA.trim().toLowerCase() === 'others'
    const bIsOther = labelB.trim().toLowerCase() === 'other' || labelB.trim().toLowerCase() === 'others'
    if(aIsOther && !bIsOther) return 1
    if(!aIsOther && bIsOther) return -1
    return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' })
  })
}

export const withAllFirst = (items, allLabel = 'All') => {
  const rest = items.filter(item => String(item).toLowerCase() !== String(allLabel).toLowerCase())
  return [allLabel, ...sortTextAsc(rest)]
}
