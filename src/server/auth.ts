// No auth today: every visitor acts as one demo maintainer.
// TODO: GitHub OAuth — resolve the signed-in maintainer and check they maintain the project.
export type CurrentUser = { login: string; name: string };

export function getCurrentUser(): CurrentUser {
  // The demo maintainer owns the repo that receives the demo requests (seed/requests.json).
  const login = process.env.NEXT_PUBLIC_DEMO_USER ?? "Calonca";
  return { login, name: login };
}
