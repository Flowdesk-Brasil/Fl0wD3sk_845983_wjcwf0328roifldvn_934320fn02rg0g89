export function fdNavItemClass({
  active = false,
  disabled = false,
  danger = false,
}: {
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
} = {}) {
  const state = [
    "fd-nav-item",
    active ? "is-active" : "",
    disabled ? "is-disabled" : "",
    danger ? "is-danger" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `group ${state}`;
}

export function fdNavGroupClass({
  active = false,
  open = false,
}: {
  active?: boolean;
  open?: boolean;
} = {}) {
  return `group fd-nav-group${active ? " is-active" : open ? " is-open" : ""}`;
}
