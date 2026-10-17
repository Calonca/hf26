// No auth today: every visitor acts as one demo maintainer.
// TODO: GitHub OAuth — resolve the signed-in maintainer and check they maintain the project.
export type CurrentUser = { login: string; name: string };

export function getCurrentUser(): CurrentUser {
  return { login: "demo-maintainer", name: "Demo Maintainer" };
}
