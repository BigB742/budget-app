export const getFirstName = () => {
  try { return JSON.parse(localStorage.getItem("user"))?.firstName || ""; } catch { return ""; }
};
