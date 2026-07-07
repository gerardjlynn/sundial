// Components that perform undeclared effects. Shaped for toy scale: PascalCase
// exported functions returning null so no JSX/react types are needed — the SND
// rules read syntax, not types.

export function UserCard() {
  fetch("/api/user"); // SND0001 net
  localStorage.setItem("seen", "1"); // SND0002 storage
  return null;
}

export const Clock = () => {
  document.title = "tick"; // SND0003 dom
  return null;
};

// Not a component (camelCase): its fetch must NOT be flagged.
export function loadData() {
  fetch("/api/data");
  return null;
}
