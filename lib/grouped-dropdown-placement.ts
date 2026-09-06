/** Use the whole search bar to choose one direction, regardless of menu height. */
export function getGroupedDropdownPlacement(control: HTMLElement | null) {
  if (!control || window.innerWidth <= 820) return null;
  const group = control.closest<HTMLElement>("[data-dropdown-placement-group]");
  if (!group) return null;

  const gap = 12;
  const groupRect = group.getBoundingClientRect();
  const controlRect = control.getBoundingClientRect();
  const spaceAbove = Math.max(0, groupRect.top - gap * 2);
  const spaceBelow = Math.max(0, window.innerHeight - groupRect.bottom - gap * 2);
  const opensAbove = spaceBelow < 624 && spaceAbove > spaceBelow;
  const availableHeight = opensAbove
    ? controlRect.top - gap * 2
    : window.innerHeight - controlRect.bottom - gap * 2;

  return { opensAbove, maxHeight: Math.max(0, Math.floor(availableHeight)) };
}
