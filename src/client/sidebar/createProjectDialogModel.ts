/** Returns whether a project title has user-provided content. */
export function isProjectTitleValid(title: string): boolean {
  return title.trim() !== "";
}
