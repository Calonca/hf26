"use server";
import { contributionBrief, discoverMatches, requestTriage } from "../gemma";

export async function getBrief(login: string, force = false) {
  return contributionBrief(login, force);
}

export async function getTriage(id: number, force = false) {
  return requestTriage(id, force);
}

export async function getMatches(skills: string, hours: string, force = false) {
  return discoverMatches(skills, hours, force);
}
